package com.filebonsai.catalog.application;

/**
 * The operator-chosen name of the connection that serves committed versions' bytes. A deployment has one connection,
 * so it names every version; storage supplies it, keeping catalog free of storage configuration.
 */
@FunctionalInterface
public interface StorageConnectionName {
    String displayName();
}
