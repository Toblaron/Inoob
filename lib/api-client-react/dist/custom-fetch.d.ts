export type CustomFetchOptions = RequestInit & {
    responseType?: "json" | "text" | "blob" | "auto";
};
export type ErrorType<T = unknown> = ApiError<T>;
export type BodyType<T> = T;
export declare class ApiError<T = unknown> extends Error {
    readonly name = "ApiError";
    readonly status: number;
    readonly statusText: string;
    readonly data: T | null;
    readonly headers: Headers;
    readonly response: Response;
    readonly method: string;
    readonly url: string;
    constructor(response: Response, data: T | null, requestInfo: {
        method: string;
        url: string;
    });
}
export declare class ResponseParseError extends Error {
    readonly name = "ResponseParseError";
    readonly status: number;
    readonly statusText: string;
    readonly headers: Headers;
    readonly response: Response;
    readonly method: string;
    readonly url: string;
    readonly rawBody: string;
    readonly cause: unknown;
    constructor(response: Response, rawBody: string, cause: unknown, requestInfo: {
        method: string;
        url: string;
    });
}
export declare function customFetch<T = unknown>(input: RequestInfo | URL, options?: CustomFetchOptions): Promise<T>;
//# sourceMappingURL=custom-fetch.d.ts.map