package com.filebonsai.platform.web;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.module.SimpleModule;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.format.FormatterRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class ApiConfiguration implements WebMvcConfigurer {
    static UUID strictUuid(String input) {
        if (input == null
                || !input.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            throw new IllegalArgumentException("Expected a canonical UUID");
        }
        return UUID.fromString(input);
    }

    @Override
    public void addFormatters(FormatterRegistry registry) {
        registry.addConverter(String.class, UUID.class, ApiConfiguration::strictUuid);
    }

    @Bean
    Jackson2ObjectMapperBuilderCustomizer strictInput() {
        return builder -> {
            builder.featuresToEnable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
            SimpleModule module = new SimpleModule("filebonsai-strict-input");
            module.addDeserializer(String.class, new StrictStringDeserializer());
            module.addDeserializer(UUID.class, new StrictUuidDeserializer());
            builder.modulesToInstall(module);
        };
    }

    @Bean
    OpenAPI catalogApi() {
        return new OpenAPI()
                .components(new Components()
                        .addSecuritySchemes(
                                "sessionCookie",
                                new SecurityScheme()
                                        .type(SecurityScheme.Type.APIKEY)
                                        .in(SecurityScheme.In.COOKIE)
                                        .name("FILEBONSAI_SESSION")))
                .addSecurityItem(new SecurityRequirement().addList("sessionCookie"))
                .info(
                        new Info()
                                .title("Filebonsai Catalog")
                                .version("0.1.0")
                                .description(
                                        "Code-first Filebonsai API. The PostgreSQL profile authenticates the local owner and derives catalog scope from server-side membership."))
                .servers(List.of(new Server().url("http://127.0.0.1:8080")));
    }

    private static final class StrictStringDeserializer extends JsonDeserializer<String> {
        @Override
        public String deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_STRING)) {
                return (String) context.handleUnexpectedToken(String.class, parser);
            }
            return parser.getText();
        }
    }

    private static final class StrictUuidDeserializer extends JsonDeserializer<UUID> {
        @Override
        public UUID deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_STRING)) {
                return (UUID) context.handleUnexpectedToken(UUID.class, parser);
            }
            try {
                return strictUuid(parser.getText());
            } catch (IllegalArgumentException exception) {
                return (UUID) context.handleWeirdStringValue(UUID.class, parser.getText(), "Expected a canonical UUID");
            }
        }
    }
}
