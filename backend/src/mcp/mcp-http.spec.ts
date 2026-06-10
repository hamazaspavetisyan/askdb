import { isAuthorized } from './mcp-http';

describe('isAuthorized', () => {
    it('is open when no token is configured', () => {
        expect(isAuthorized(undefined, undefined)).toBe(true);
        expect(isAuthorized('Bearer whatever', undefined)).toBe(true);
    });

    it('requires a matching bearer token when configured', () => {
        expect(isAuthorized('Bearer secret', 'secret')).toBe(true);
        expect(isAuthorized('bearer secret', 'secret')).toBe(true); // case-insensitive scheme
        expect(isAuthorized('Bearer wrong', 'secret')).toBe(false);
        expect(isAuthorized('secret', 'secret')).toBe(false); // missing scheme
        expect(isAuthorized(undefined, 'secret')).toBe(false);
    });
});
