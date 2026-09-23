FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /src
COPY . .
RUN ./mvnw -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S filebonsai && adduser -S -G filebonsai filebonsai
WORKDIR /app
COPY --from=build /src/target/filebonsai-catalog-0.1.0-SNAPSHOT.jar app.jar
RUN mkdir /data && chown filebonsai:filebonsai /data
USER filebonsai
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
