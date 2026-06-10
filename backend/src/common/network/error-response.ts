export class ErrorResponse {
    public readonly message: string;
    public readonly code: number;
    public readonly data: any;

    constructor(message: string, code: number, data?: any) {
        this.message = message;
        this.data = data;
        this.code = code;
    }
}
