import Integer = GoogleAppsScript.Integer;
import { Log, SECONDS_IN_HOUR } from "./Common";
import { type ICacheProxy } from "../lib";

const MAX_CACHE_VAL_SIZE_BYTES = 100 * 1024;
const SPLIT_KEY_SUFFIX = `_part_`;
const SPLIT_METADATA_KEY_SUFFIX = `_meta`;

function byteCount(s: string): number {
  return encodeURI(s).split(/%..|./).length - 1;
}

export const MAX_EXPIRATION = SECONDS_IN_HOUR * 6;

export type Entries = Record<string, any>;
export type ExpirationEntries = Record<
  string,
  {
    value: string;
    expiration?: Integer;
  }
>;

export class DefaultCacheProxy implements ICacheProxy {
  get(key: string): string | null {
    const cache = CacheService.getScriptCache();
    const value = cache.get(key);

    // Check if this key is part of a split value
    const metaKey = key + SPLIT_METADATA_KEY_SUFFIX;
    const metaData = cache.get(metaKey);

    if (!metaData) {
      // Single value key - return normally
      return value;
    }

    try {
      const {
        originalKey,
        partCount,
      }: {
        originalKey: string;
        partCount: number;
        totalSize: number;
      } = JSON.parse(metaData);

      if (originalKey !== key) {
        // This is a part key, but not the original - return null
        return null;
      }

      // This is the original key for a split value - reconstruct
      let reconstructedValue = ``;

      for (let i = 0; i < partCount; i++) {
        const partKey = `${key}${SPLIT_KEY_SUFFIX}${i}`;
        const partValue = cache.get(partKey);
        if (partValue) {
          reconstructedValue += partValue;
        }
      }

      // Clean up split parts and metadata if reconstructed successfully
      this._cleanupSplitParts(key, partCount);

      return reconstructedValue;
    } catch (error) {
      // If metadata parsing fails, treat as single value
      Log.info(`Failed to parse metadata for key ${key}: ${error}`);
      return value;
    }
  }

  getAll(keys: string[]): Entries {
    const results: Entries = {};

    keys.forEach((key) => {
      const value = this.get(key);
      if (value !== null) {
        results[key] = value;
      }
    });

    return results;
  }

  putAll(values: ExpirationEntries): void {
    // Handle single values normally
    const singleValues: ExpirationEntries = {};
    const largeValues: Record<string, { value: string; expiration: Integer }> =
      {};

    Object.keys(values).forEach((key) => {
      const { value, expiration = MAX_EXPIRATION } = values[key];
      const size = byteCount(value);

      if (size > MAX_CACHE_VAL_SIZE_BYTES) {
        largeValues[key] = { value, expiration: expiration || MAX_EXPIRATION };
      } else {
        singleValues[key] = { value, expiration };
      }
    });

    // Put single values normally
    if (Object.keys(singleValues).length > 0) {
      const map: Record<number, Record<string, string>> = {};
      Object.keys(singleValues).forEach((key) => {
        const { value, expiration } = singleValues[key];
        const expNum = +(expiration || MAX_EXPIRATION); // Convert to number with fallback
        if (!(expNum in map)) {
          map[expNum] = {};
        }
        map[expNum][key] = value;
      });
      Object.keys(map).forEach((expirationStr) => {
        const expiration = +expirationStr;
        CacheService.getScriptCache().putAll(map[expiration], expiration);
      });
    }

    // Handle large values by splitting
    Object.keys(largeValues).forEach((originalKey) => {
      this._putLargeValue(
        originalKey,
        largeValues[originalKey].value,
        largeValues[originalKey].expiration,
      );
    });
  }

  /**
   * @param key
   * @param value
   * @param expirationInSeconds By default, keep for 6 hours (maximum time allowed by GAS)
   */
  put(
    key: string,
    value: string,
    expirationInSeconds: Integer = MAX_EXPIRATION,
  ): void {
    const size = byteCount(value);

    if (size > 0.9 * MAX_CACHE_VAL_SIZE_BYTES) {
      Log.info(
        `Cache value for key ${key} is more than 90% of the maximum size of ${MAX_CACHE_VAL_SIZE_BYTES} bytes.`,
      );
    }

    if (size > MAX_CACHE_VAL_SIZE_BYTES) {
      Log.info(
        `Cache value for key ${key} exceeds limit (${size} bytes). Splitting into multiple keys.`,
      );
      this._putLargeValue(key, value, expirationInSeconds);
      return;
    }

    // Single value - store normally
    CacheService.getScriptCache().put(key, value, expirationInSeconds);
  }

  private _putLargeValue(
    key: string,
    value: string,
    expirationInSeconds: Integer,
  ): void {
    const cache = CacheService.getScriptCache();
    const chunkSize = MAX_CACHE_VAL_SIZE_BYTES * 0.8; // Use 80% to leave room for metadata
    const parts: string[] = [];

    // Split the value into chunks
    for (let i = 0; i < value.length; i += chunkSize) {
      parts.push(value.substring(i, i + chunkSize));
    }

    const partCount = parts.length;
    const totalSize = byteCount(value);

    // Store each part
    parts.forEach((part, index) => {
      const partKey = `${key}${SPLIT_KEY_SUFFIX}${index}`;
      cache.put(partKey, part, expirationInSeconds);
    });

    // Store metadata with the original key
    const metaData = {
      originalKey: key,
      partCount,
      totalSize,
      splitTimestamp: new Date().getTime(),
      splitVersion: 1,
    };

    cache.put(
      key + SPLIT_METADATA_KEY_SUFFIX,
      JSON.stringify(metaData),
      expirationInSeconds,
    );

    Log.info(
      `Split value for key ${key} into ${partCount} parts. Total size: ${totalSize} bytes.`,
    );
  }

  private _cleanupSplitParts(key: string, partCount: number): void {
    const cache = CacheService.getScriptCache();

    // Remove split parts
    for (let i = 0; i < partCount; i++) {
      const partKey = `${key}${SPLIT_KEY_SUFFIX}${i}`;
      cache.remove(partKey);
    }

    // Remove metadata
    cache.remove(key + SPLIT_METADATA_KEY_SUFFIX);

    Log.info(`Cleaned up split parts for key ${key}`);
  }

  remove(key: string): void {
    const cache = CacheService.getScriptCache();
    const metaKey = key + SPLIT_METADATA_KEY_SUFFIX;
    const metaData = cache.get(metaKey);

    if (metaData) {
      try {
        const {
          originalKey,
          partCount,
        }: { originalKey: string; partCount: number } = JSON.parse(metaData);

        if (originalKey === key) {
          // This is a split value - remove all parts and metadata
          this._cleanupSplitParts(key, partCount);
          return;
        }
      } catch (error) {
        Log.info(`Failed to parse metadata when removing key ${key}: ${error}`);
      }
    }

    // Single value or failed to parse metadata - remove normally
    cache.remove(key);
  }

  removeAll(keys: string[]): void {
    const cache = CacheService.getScriptCache();
    const allKeysToRemove: string[] = [...keys];

    // Check for any split values among the keys
    keys.forEach((key) => {
      const metaKey = key + SPLIT_METADATA_KEY_SUFFIX;
      const metaData = cache.get(metaKey);

      if (metaData) {
        try {
          const {
            originalKey,
            partCount,
          }: { originalKey: string; partCount: number } = JSON.parse(metaData);

          if (originalKey === key) {
            // Add all split parts to removal list
            for (let i = 0; i < partCount; i++) {
              allKeysToRemove.push(`${key}${SPLIT_KEY_SUFFIX}${i}`);
            }
            allKeysToRemove.push(metaKey);
          }
        } catch (error) {
          // Failed to parse metadata - just add the meta key to removal list
          allKeysToRemove.push(metaKey);
        }
      }
    });

    if (allKeysToRemove.length > 0) {
      cache.removeAll(allKeysToRemove);
    }
  }
}

export const CacheProxy = new DefaultCacheProxy();
