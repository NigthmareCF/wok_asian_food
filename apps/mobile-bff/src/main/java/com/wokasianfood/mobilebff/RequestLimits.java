package com.wokasianfood.mobilebff;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Single-instance safety limit; deployments with replicas need a shared ingress limiter. */
@Component
final class RequestLimits {
    private final Clock clock;
    private final Map<String, Bucket> buckets = new HashMap<>();

    RequestLimits() { this(Clock.systemUTC()); }
    RequestLimits(Clock clock) { this.clock = clock; }

    synchronized void check(String key, int maximum) {
        long now = clock.millis();
        buckets.entrySet().removeIf(entry -> now - entry.getValue().started >= 60_000);
        Bucket bucket = buckets.get(key);
        if (bucket == null) {
            if (buckets.size() >= 10_000) throw new BffFailure(429);
            bucket = new Bucket(now);
            buckets.put(key, bucket);
        }
        if (++bucket.count > maximum) throw new BffFailure(429);
    }

    private static final class Bucket {
        final long started;
        int count;
        Bucket(long started) { this.started = started; }
    }
}
