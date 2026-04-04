import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { ErrorResponse, GenerateTemplateRequest, HealthStatus, SunoTemplate } from "./api.schemas";
import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
/**
 * Returns server health status
 * @summary Health check
 */
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * Fetches song metadata from YouTube and uses AI to generate a structured Suno.ai prompt template
 * @summary Generate a Suno.ai template from a YouTube URL
 */
export declare const getGenerateSunoTemplateUrl: () => string;
export declare const generateSunoTemplate: (generateTemplateRequest: GenerateTemplateRequest, options?: RequestInit) => Promise<SunoTemplate>;
export declare const getGenerateSunoTemplateMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof generateSunoTemplate>>, TError, {
        data: BodyType<GenerateTemplateRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof generateSunoTemplate>>, TError, {
    data: BodyType<GenerateTemplateRequest>;
}, TContext>;
export type GenerateSunoTemplateMutationResult = NonNullable<Awaited<ReturnType<typeof generateSunoTemplate>>>;
export type GenerateSunoTemplateMutationBody = BodyType<GenerateTemplateRequest>;
export type GenerateSunoTemplateMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Generate a Suno.ai template from a YouTube URL
 */
export declare const useGenerateSunoTemplate: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof generateSunoTemplate>>, TError, {
        data: BodyType<GenerateTemplateRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof generateSunoTemplate>>, TError, {
    data: BodyType<GenerateTemplateRequest>;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map