package com.filebonsai.platform.web;

import com.filebonsai.access.AccessFailure;
import com.filebonsai.catalog.application.CatalogFailure;
import com.filebonsai.transfers.application.UploadFailure;
import java.beans.PropertyEditorSupport;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @InitBinder
    void strictUuidBinding(WebDataBinder binder) {
        binder.registerCustomEditor(UUID.class, new PropertyEditorSupport() {
            @Override
            public void setAsText(String text) {
                setValue(ApiConfiguration.strictUuid(text));
            }
        });
    }

    @ExceptionHandler(InvalidField.class)
    ResponseEntity<Object> invalidField(InvalidField exception, WebRequest request) {
        return ResponseEntity.badRequest()
                .body(error(
                        request,
                        400,
                        "VALIDATION_FAILED",
                        "Request validation failed",
                        List.of(new FieldErrorResponse(exception.field(), exception.code(), exception.getMessage()))));
    }

    @ExceptionHandler(UploadFailure.class)
    ResponseEntity<Object> uploadFailure(UploadFailure exception, WebRequest request) {
        int status =
                switch (exception.reason()) {
                    case UPLOAD_NOT_FOUND, ENTRY_NOT_FOUND -> 404;
                    case EXPIRED -> 410;
                    case TOO_LARGE -> 413;
                    case STORAGE_UNAVAILABLE -> 503;
                    default -> 409;
                };
        var response = ResponseEntity.status(status);
        if (exception.reason() == UploadFailure.Reason.STORAGE_UNAVAILABLE) {
            response.header(HttpHeaders.RETRY_AFTER, "1");
        }
        return response.body(error(request, status, exception.reason().name(), exception.getMessage(), List.of()));
    }

    @ExceptionHandler(CatalogFailure.class)
    ResponseEntity<Object> catalogFailure(CatalogFailure exception, WebRequest request) {
        int status =
                switch (exception.reason()) {
                    case ENTRY_NOT_FOUND -> 404;
                    case NAME_CONFLICT, IDEMPOTENCY_CONFLICT -> 409;
                    default -> 400;
                };
        return ResponseEntity.status(status)
                .body(error(request, status, exception.reason().name(), exception.getMessage(), List.of()));
    }

    @ExceptionHandler(AccessFailure.class)
    ResponseEntity<Object> accessFailure(AccessFailure exception, WebRequest request) {
        int status =
                switch (exception.reason()) {
                    case CSRF_INVALID -> 403;
                    case RATE_LIMITED -> 429;
                    default -> 401;
                };
        String code = exception.reason().name();
        String message = exception.reason() == AccessFailure.Reason.INVALID_CREDENTIALS
                ? "Invalid credentials"
                : "Request could not be processed";
        var response = ResponseEntity.status(status);
        if (exception.reason() == AccessFailure.Reason.RATE_LIMITED) {
            response.header(HttpHeaders.RETRY_AFTER, Long.toString(exception.retryAfterSeconds()));
        }
        return response.body(error(request, status, code, message, List.of()));
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException exception, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        var fields = exception.getBindingResult().getFieldErrors().stream()
                .map(field -> new FieldErrorResponse(field.getField(), "REQUIRED", "Value is required"))
                .toList();
        return handleExceptionInternal(
                exception,
                error(request, 400, "VALIDATION_FAILED", "Request validation failed", fields),
                headers,
                status,
                request);
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception exception, Object body, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        if (!(body instanceof ApiErrorResponse)) {
            String code = status.value() == 400 ? "INVALID_REQUEST" : "HTTP_" + status.value();
            body = error(request, status.value(), code, "Request could not be processed", List.of());
        }
        return super.handleExceptionInternal(exception, body, headers, status, request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Object> unexpected(Exception exception, WebRequest request) {
        LOG.error(
                "Unexpected request failure; requestId={}",
                request.getAttribute(RequestMetadataFilter.REQUEST_ID, WebRequest.SCOPE_REQUEST),
                exception);
        return ResponseEntity.internalServerError()
                .body(error(request, 500, "INTERNAL_ERROR", "An unexpected error occurred", List.of()));
    }

    private ApiErrorResponse error(
            WebRequest request, int status, String code, String message, List<FieldErrorResponse> fields) {
        return new ApiErrorResponse(
                code,
                message,
                status,
                (String) request.getAttribute(RequestMetadataFilter.REQUEST_ID, WebRequest.SCOPE_REQUEST),
                fields);
    }
}
