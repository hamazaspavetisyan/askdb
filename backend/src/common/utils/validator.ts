export class Validator {
    static isSet(data: any): boolean {
        return data !== undefined && data !== null;
    }

    static isValidObject(data: any): boolean {
        return Validator.isSet(data) && typeof data === 'object';
    }

    static isValidNumber(data: any): boolean {
        if (typeof data === 'number') {
            return Number.isFinite(data);
        }

        if (typeof data === 'string') {
            if (!Validator.isSet(data)) {
                return false;
            }

            return Number.isFinite(parseFloat(data)); // also checks NaN
        }
        return false;
    }

    static isValidString(data: any): boolean {
        const isValid =
            Validator.isSet(data) &&
            (data || data === '') &&
            typeof data === 'string';
        if (!isValid) {
            return false;
        }
        return data.trim().length > 0;
    }

    static isValidStringOrEmpty(data: any): boolean {
        return (
            Validator.isSet(data) &&
            (data || data === '') &&
            typeof data === 'string'
        );
    }

    static isValidName(name: any): boolean {
        if (!Validator.isValidString(name)) {
            return false;
        }
        const trimmedName = name.trim();
        return trimmedName.length > 0 && trimmedName.length <= 200;
    }

    static isValidEmail(email: any): boolean {
        if (!Validator.isValidString(email) || email.length > 254) {
            return false;
        }

        const tester =
            /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
        if (!tester.test(email)) {
            return false;
        }

        const parts = email.split('@');
        if (parts.length !== 2 || parts[0].length > 64) {
            return false;
        }

        const domainParts = parts[1].split('.');
        return !domainParts.some((part) => part.length > 63);
    }

    static isValidBoolean(data: any): boolean {
        return typeof data === 'boolean';
    }

    static isValidInteger(data: any): boolean {
        return (
            Validator.isValidNumber(data) && Number(data) === parseInt(data, 10)
        );
    }

    static isValidNonNegativeNumber(data: any): boolean {
        return (
            Validator.isValidNumber(data) &&
            (Number(data) === parseInt(data, 10) ||
                Number(data) === parseFloat(data)) &&
            data >= 0
        );
    }

    static isValidPositiveNumber(data: any): boolean {
        return (
            Validator.isValidNumber(data) &&
            (Number(data) === parseInt(data, 10) ||
                Number(data) === parseFloat(data)) &&
            data > 0
        );
    }

    static isValidNonNegativeInteger(data: any): boolean {
        return (
            Validator.isValidNumber(data) &&
            Number(data) === parseInt(data, 10) &&
            data >= 0
        );
    }

    static isValidPositiveInteger(data: any): boolean {
        return (
            Validator.isValidNumber(data) &&
            Number(data) === parseInt(data, 10) &&
            data > 0
        );
    }

    static isValidArray(data: any): boolean {
        return Validator.isSet(data) && Array.isArray(data);
    }

    // Validate IPv4 address
    static isValidIPv4(data: string): boolean {
        const ipv4Segment = '(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)';
        const ipv4Regex = new RegExp(
            `^${ipv4Segment}\\.${ipv4Segment}\\.${ipv4Segment}\\.${ipv4Segment}$`
        );
        return ipv4Regex.test(data);
    }

    // Validate IPv6 address (basic validation, includes ::1)
    static isValidIPv6(data: string): boolean {
        if (data === '::1') return true;
        // Simplified IPv6 regex (matches 8 groups of 0-4 hex digits separated by :, or compressed forms)
        const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$/;
        return ipv6Regex.test(data);
    }

    // Main IP validation function
    static isValidIP(data: any): boolean {
        if (!Validator.isValidString(data)) return false;
        return Validator.isValidIPv4(data) || Validator.isValidIPv6(data);
    }

    static isValidDate(data: any): boolean {
        if (!Validator.isSet(data)) {
            return false;
        }
        if (Object.prototype.toString.call(data) === '[object Date]') {
            return !isNaN(data.getTime());
        }
        return false;
    }

    static isValidTimestamp(data: any): boolean {
        if (!Validator.isValidNonNegativeInteger(data)) {
            return false;
        }
        return parseInt(data, 10) <= 2538086400000;
    }

    static isFirebaseMessageDataType(data: any): boolean {
        if (!Validator.isValidObject(data)) {
            return false;
        }
        for (const key of Object.keys(data)) {
            if (
                !Validator.isValidString(key) ||
                !Validator.isValidString(data[key])
            ) {
                return false;
            }
            const reservedWords = ['from', 'notification', 'message_type'];
            if (
                reservedWords.includes(key) ||
                reservedWords.includes(data[key])
            ) {
                return false;
            }
            if (
                key.startsWith('google') ||
                key.startsWith('gmc') ||
                data[key].startsWith('google') ||
                data[key].startsWith('gmc')
            ) {
                return false;
            }
        }
        return true;
    }

    static getStringBetween(str: string, start: string, end: string): string {
        const startIndex = str.indexOf(start);
        if (startIndex === -1) {
            return '';
        }
        const endIndex = str.lastIndexOf(end);
        if (endIndex === -1 || endIndex <= startIndex + 1) {
            return '';
        }
        return str.substring(startIndex + 1, endIndex);
    }

    static parseBoolean(val: any): boolean {
        return val === true || val === 'true';
    }
}
