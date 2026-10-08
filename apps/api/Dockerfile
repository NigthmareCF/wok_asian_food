FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml ./
COPY src ./src
RUN mvn -B -ntp -DskipTests package

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 wok
RUN install -d -o wok -g wok /var/lib/wok/payment-evidence
WORKDIR /app
COPY --from=build /build/target/wok-api-0.1.0-SNAPSHOT.jar /app/api.jar
USER wok
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/api.jar"]
