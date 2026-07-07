export interface ApplicationResult<T = void> {
    success: boolean;

    message: string;

    data?: T;
}

export function successResult<T>(
    data?: T,
    message = "Success."
): ApplicationResult<T> {
    return {
        success: true,
        message,
        data,
    };
}

export function failureResult(
    message: string
): ApplicationResult {
    return {
        success: false,
        message,
    };
}