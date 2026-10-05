package com.wokasianfood.mobilebff;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
final class CoreApiClient {
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private static final Set<String> SAFE_ERRORS = Set.of("400", "401", "403", "404", "409", "422", "429");
    private final URI origin;
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();

    CoreApiClient(@Value("${wok.bff.core-base-url}") String baseUrl) {
        origin = validatedOrigin(baseUrl);
    }

    static URI validatedOrigin(String value) {
        URI uri = URI.create(value);
        boolean local = Set.of("localhost", "127.0.0.1", "[::1]").contains(uri.getHost() == null ? "" : uri.getHost());
        if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null
                || uri.getFragment() != null || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))
                || !("https".equals(uri.getScheme()) || (local && "http".equals(uri.getScheme())))) {
            throw new IllegalArgumentException("Core API must be an HTTPS origin (HTTP only on loopback for development)");
        }
        return uri;
    }

    Reply exchange(String method, String path, String authorization, String idempotencyKey,
                   byte[] body, String requestId, String remoteAddress) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(origin.resolve(path))
                .timeout(Duration.ofSeconds(5)).header("Accept", "application/json")
                .header("X-Request-Id", requestId);
        if (authorization != null) builder.header("Authorization", authorization);
        if (idempotencyKey != null) builder.header("Idempotency-Key", idempotencyKey);
        // Ignore caller-provided forwarding headers; the core receives the actual socket peer.
        if (remoteAddress != null) builder.header("X-Forwarded-For", remoteAddress);
        if (body.length > 0) builder.header("Content-Type", "application/json");
        builder.method(method, body.length == 0 ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofByteArray(body));
        var pending = client.sendAsync(builder.build(), info -> new BoundedBody());
        try {
            // Bound the entire exchange, including a response body that stalls after its headers.
            HttpResponse<byte[]> response = pending.get(5, TimeUnit.SECONDS);
            if (response.statusCode() >= 300) {
                throw new BffFailure(SAFE_ERRORS.contains(Integer.toString(response.statusCode()))
                        ? response.statusCode() : 503);
            }
            if (response.body().length > 0 && !response.headers().firstValue("Content-Type")
                    .orElse("").toLowerCase(java.util.Locale.ROOT).startsWith("application/json")) {
                throw new BffFailure(503);
            }
            return new Reply(response.statusCode(), response.body());
        } catch (InterruptedException interrupted) {
            pending.cancel(true);
            Thread.currentThread().interrupt();
            throw new BffFailure(503);
        } catch (ExecutionException | TimeoutException unavailable) {
            pending.cancel(true);
            throw new BffFailure(503);
        }
    }

    private static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final HttpResponse.BodySubscriber<byte[]> delegate = HttpResponse.BodySubscribers.ofByteArray();
        private Flow.Subscription subscription;
        private long received;
        private boolean rejected;

        @Override public CompletionStage<byte[]> getBody() { return delegate.getBody(); }
        @Override public void onSubscribe(Flow.Subscription value) { subscription = value; delegate.onSubscribe(value); }
        @Override public void onNext(List<ByteBuffer> buffers) {
            if (rejected) return;
            for (ByteBuffer buffer : buffers) received += buffer.remaining();
            if (received > MAX_RESPONSE_BYTES) {
                rejected = true;
                subscription.cancel();
                delegate.onError(new IOException("Core response exceeds size limit"));
            } else delegate.onNext(buffers);
        }
        @Override public void onError(Throwable error) { if (!rejected) delegate.onError(error); }
        @Override public void onComplete() { if (!rejected) delegate.onComplete(); }
    }

    record Reply(int status, byte[] body) {}
}
