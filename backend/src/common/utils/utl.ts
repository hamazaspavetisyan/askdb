import * as crypto from 'crypto';
import { InternalServerErrorException } from '@nestjs/common';

export const generateOtp = (length: number = 6): string => {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

export function humanFileSize(
    bytes: number,
    si: boolean = false,
    dp: number = 1
): string {
    const thresh = si ? 1000 : 1024;

    if (Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }

    const units = si
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

    let u = -1;
    const r = 10 ** dp;

    do {
        bytes /= thresh;
        ++u;
    } while (
        Math.round(Math.abs(bytes) * r) / r >= thresh &&
        u < units.length - 1
    );

    return bytes.toFixed(dp) + ' ' + units[u];
}

export function generateSmsId(length: number = 18): number {
    if (length < 13 || length > 18) {
        throw new Error('smsId length must be between 13 and 18 digits.');
    }

    const timestamp = Date.now().toString(); // 13 digits
    const reversed = timestamp.split('').reverse().join(''); // e.g. '4859703211708'
    const randomLength = length - 13;

    const random = Array.from({ length: randomLength }, () =>
        Math.floor(Math.random() * 10)
    ).join('');

    const combined = `${reversed}${random}`;
    return Number(combined);
}

export function encryptData(
    data: string,
    configKey: string,
    configIV: string
): string {
    const key = Buffer.from(configKey, 'hex');
    const iv = Buffer.from(configIV, 'hex');

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    return cipher.update(data, 'hex', 'hex') + cipher.final('hex');
}

export function decryptData(
    data: string,
    configKey: string,
    configIV: string
): string {
    const key = Buffer.from(configKey, 'hex');
    const iv = Buffer.from(configIV, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return decipher.update(data, 'hex', 'hex') + decipher.final('hex');
}

export function sanityCheck(condition: boolean, message: string): void {
    if (!condition) {
        throw new InternalServerErrorException(`assertion failed: ${message}`);
    }
}

export function mustNeverReachHere(message: string): void {
    throw new InternalServerErrorException(`must never reach here: ${message}`);
}

export async function sleep(milliseconds: number): Promise<void> {
    return new Promise<void>((r) => setTimeout(r, milliseconds));
}

function onlyUnique<T>(value: T, index: number, self: T[]) {
    return self.indexOf(value) === index;
}

export function arrayUnique<T>(ar: T[]): T[] {
    return ar.filter(onlyUnique);
}

export function getSetDifference<T>(set1: Set<T>, set2: Set<T>): Set<T> {
    return new Set(Array.from(set1).filter((element) => !set2.has(element)));
}

/**
 * Converts a string from camelCase to snake_case.
 * @param {string} key - The string in camelCase.
 * @returns {string} The string in snake_case.
 */
function camelToSnakeCase(key: string): string {
    return key.replace(/[A-Z0-9]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Recursively converts all keys in an object or array of objects from camelCase to snake_case.
 * @param {any} obj - The object or array to convert.
 * @returns {any} A new object or array with keys converted to snake_case.
 */
export function convertKeysToSnakeCase<T>(obj: T): any {
    if (obj === null || typeof obj !== 'object') {
        return obj; // Return primitives as is
    }

    if (Array.isArray(obj)) {
        // If it's an array, map over its elements and recursively convert
        return obj.map((item) => convertKeysToSnakeCase(item));
    }

    // If it's an object, create a new object with converted keys
    const newObj: { [key: string]: any } = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const newKey = camelToSnakeCase(key);
            newObj[newKey] = convertKeysToSnakeCase(obj[key]);
        }
    }
    return newObj;
}

function snakeToCamel(s: string): string {
    return s.replace(/([-_][a-zA-Z0-9])/gi, ($1) => {
        return $1.toUpperCase().replace('-', '').replace('_', '');
    });
}

function convertKeysToCamelCaseHelper(data: any) {
    if (Array.isArray(data)) {
        return data.map((item) => convertKeysToCamelCaseHelper(item));
    } else if (typeof data === 'object' && data !== null) {
        if (data instanceof Date) {
            return data;
        }
        return Object.keys(data).reduce((acc, key) => {
            if (key === 'last_4') {
                debugger;
            }
            const camelKey = snakeToCamel(key);
            acc[camelKey] = convertKeysToCamelCaseHelper(data[key]);
            return acc;
        }, {});
    }
    return data;
}

export function convertKeysToCamelCase<T>(data: any): T {
    return convertKeysToCamelCaseHelper(data) as T;
}

export function convertValuesToString(obj: any): any {
    if (obj === null) return 'null'; // convert null to string
    if (typeof obj === 'number' || typeof obj === 'boolean') {
        return obj.toString();
    }
    if (Array.isArray(obj)) {
        return obj.map(convertValuesToString); // recursively handle arrays
    }
    if (typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
            newObj[key] = convertValuesToString(obj[key]);
        }
        return newObj;
    }
    return obj; // keep strings, functions, undefined, etc. as-is
}

export function isTransliterated(str: string): boolean {
    return /[^\x00-\x7F]/.test(str);
}

export function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Generates a unique 8-digit account ID.
 * Combines last 4 digits of timestamp with 4 random digits.
 * @returns 8-digit string ID
 */
export function generateAccountId(): string {
    const last4 = (Date.now() % 10000).toString().padStart(4, '0');
    const rand4 = crypto.randomInt(0, 10000).toString().padStart(4, '0');
    return `${last4}${rand4}`;
}
