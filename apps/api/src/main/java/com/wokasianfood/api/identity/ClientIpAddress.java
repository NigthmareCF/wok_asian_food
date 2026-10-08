package com.wokasianfood.api.identity;

import java.net.InetAddress;
import java.net.UnknownHostException;

/** Parses address literals only; never resolves hostnames or accepts ports, CIDR or zone IDs. */
final class ClientIpAddress {
    private ClientIpAddress() {}

    static String normalize(String value) {
        byte[] address = bytes(value);
        if (address == null) return null;
        try {
            // Constructing from bytes cannot perform DNS resolution.
            return InetAddress.getByAddress(address).getHostAddress();
        } catch (UnknownHostException impossibleLength) {
            throw new IllegalStateException(impossibleLength);
        }
    }

    static byte[] bytes(String value) {
        if (value == null) return null;
        String candidate = value.trim();
        return candidate.contains(":") ? ipv6(candidate) : ipv4(candidate);
    }

    private static byte[] ipv4(String value) {
        String[] parts = value.split("\\.", -1);
        if (parts.length != 4) return null;
        byte[] bytes = new byte[4];
        for (int i = 0; i < parts.length; i++) {
            String part = parts[i];
            if (!part.matches("0|[1-9][0-9]{0,2}")) return null;
            int number = Integer.parseInt(part);
            if (number > 255) return null;
            bytes[i] = (byte) number;
        }
        return bytes;
    }

    private static byte[] ipv6(String value) {
        if (value.contains(".")) {
            int lastColon = value.lastIndexOf(':');
            byte[] tail = ipv4(value.substring(lastColon + 1));
            if (tail == null) return null;
            value = value.substring(0, lastColon + 1)
                    + Integer.toHexString((tail[0] & 255) * 256 + (tail[1] & 255)) + ":"
                    + Integer.toHexString((tail[2] & 255) * 256 + (tail[3] & 255));
        }
        String[] halves = value.split("::", -1);
        if (halves.length > 2) return null;
        String[] left = groups(halves[0]);
        String[] right = halves.length == 2 ? groups(halves[1]) : new String[0];
        int count = left.length + right.length;
        if (halves.length == 1 ? count != 8 : count >= 8) return null;
        byte[] bytes = new byte[16];
        return writeGroups(left, bytes, 0) && writeGroups(right, bytes, 8 - right.length) ? bytes : null;
    }

    private static String[] groups(String value) {
        return value.isEmpty() ? new String[0] : value.split(":", -1);
    }

    private static boolean writeGroups(String[] groups, byte[] bytes, int offset) {
        for (int i = 0; i < groups.length; i++) {
            if (!groups[i].matches("[0-9a-fA-F]{1,4}")) return false;
            int number = Integer.parseInt(groups[i], 16);
            bytes[(offset + i) * 2] = (byte) (number >>> 8);
            bytes[(offset + i) * 2 + 1] = (byte) number;
        }
        return true;
    }
}
