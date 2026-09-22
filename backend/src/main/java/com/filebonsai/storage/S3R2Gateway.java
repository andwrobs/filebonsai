package com.filebonsai.storage;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CompletedMultipartUpload;
import software.amazon.awssdk.services.s3.model.CompletedPart;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

/** Cloudflare R2 S3 API calls. Provider exception text is never copied to public failures. */
public final class S3R2Gateway implements R2Gateway {
    private final S3Client client;
    private final String bucket;

    public S3R2Gateway(S3Client client, String bucket) {
        this.client = client;
        this.bucket = bucket;
    }

    @Override
    public void put(String key, byte[] body) throws IOException {
        call(() -> {
            client.putObject(request -> request.bucket(bucket).key(key), RequestBody.fromBytes(body));
            return null;
        });
    }

    @Override
    public String createMultipart(String key) throws IOException {
        return call(() -> client.createMultipartUpload(
                        request -> request.bucket(bucket).key(key))
                .uploadId());
    }

    @Override
    public String uploadPart(String key, String uploadId, int number, byte[] body) throws IOException {
        return call(() -> client.uploadPart(
                        request -> request.bucket(bucket)
                                .key(key)
                                .uploadId(uploadId)
                                .partNumber(number),
                        RequestBody.fromBytes(body))
                .eTag());
    }

    @Override
    public List<Part> listParts(String key, String uploadId) throws IOException {
        return call(() -> {
            List<Part> parts = new ArrayList<>();
            Integer marker = null;
            while (true) {
                Integer currentMarker = marker;
                var page = client.listParts(request -> {
                    request.bucket(bucket).key(key).uploadId(uploadId);
                    if (currentMarker != null) {
                        request.partNumberMarker(currentMarker);
                    }
                });
                page.parts().forEach(part -> parts.add(new Part(part.partNumber(), part.eTag(), part.size())));
                if (!Boolean.TRUE.equals(page.isTruncated())) {
                    return parts;
                }
                marker = page.nextPartNumberMarker();
            }
        });
    }

    @Override
    public void completeMultipart(String key, String uploadId, List<Part> parts) throws IOException {
        call(() -> {
            var completed = parts.stream()
                    .map(part -> CompletedPart.builder()
                            .partNumber(part.number())
                            .eTag(part.etag())
                            .build())
                    .toList();
            client.completeMultipartUpload(request -> request.bucket(bucket)
                    .key(key)
                    .uploadId(uploadId)
                    .multipartUpload(
                            CompletedMultipartUpload.builder().parts(completed).build()));
            return null;
        });
    }

    @Override
    public void abortMultipart(String key, String uploadId) throws IOException {
        call(() -> {
            client.abortMultipartUpload(
                    request -> request.bucket(bucket).key(key).uploadId(uploadId));
            return null;
        });
    }

    @Override
    public List<Upload> listMultipartUploads(String keyPrefix) throws IOException {
        return call(() -> {
            List<Upload> uploads = new ArrayList<>();
            String keyMarker = null;
            String uploadMarker = null;
            while (true) {
                String currentKeyMarker = keyMarker;
                String currentUploadMarker = uploadMarker;
                var page = client.listMultipartUploads(request -> {
                    request.bucket(bucket).prefix(keyPrefix);
                    if (currentKeyMarker != null) {
                        request.keyMarker(currentKeyMarker).uploadIdMarker(currentUploadMarker);
                    }
                });
                page.uploads().forEach(upload -> uploads.add(new Upload(upload.key(), upload.uploadId())));
                if (!Boolean.TRUE.equals(page.isTruncated())) {
                    return uploads;
                }
                keyMarker = page.nextKeyMarker();
                uploadMarker = page.nextUploadIdMarker();
            }
        });
    }

    @Override
    public Long size(String key) throws IOException {
        try {
            return client.headObject(request -> request.bucket(bucket).key(key)).contentLength();
        } catch (NoSuchKeyException exception) {
            return null;
        } catch (S3Exception exception) {
            if (exception.statusCode() == 404) {
                return null;
            }
            throw new IOException("R2 head failed", exception);
        } catch (SdkException exception) {
            throw new IOException("R2 head failed", exception);
        }
    }

    @Override
    public InputStream open(String key) throws IOException {
        return call(() -> client.getObject(request -> request.bucket(bucket).key(key)));
    }

    @Override
    public void delete(String key) throws IOException {
        call(() -> {
            client.deleteObject(request -> request.bucket(bucket).key(key));
            return null;
        });
    }

    private <T> T call(ProviderCall<T> action) throws IOException {
        try {
            return action.run();
        } catch (S3Exception exception) {
            if (exception.awsErrorDetails() != null
                    && "NoSuchUpload".equals(exception.awsErrorDetails().errorCode())) {
                throw new MissingUploadException();
            }
            throw new IOException("R2 request failed", exception);
        } catch (SdkException exception) {
            throw new IOException("R2 request failed", exception);
        }
    }

    private interface ProviderCall<T> {
        T run();
    }
}
