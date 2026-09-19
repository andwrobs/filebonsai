package com.filebonsai.catalog.application;

@FunctionalInterface
public interface CatalogScopeProvider {
    CatalogScope current();
}
