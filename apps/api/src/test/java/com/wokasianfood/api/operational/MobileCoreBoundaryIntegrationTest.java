package com.wokasianfood.api.operational;

import static org.assertj.core.api.Assertions.assertThat;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import com.wokasianfood.api.support.NodeRuntime;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.*;
import java.nio.file.Path;
import java.time.*;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

/** Opt-in real mobile transport -> real BFF -> API -> disposable PostgreSQL. */
@EnabledIfSystemProperty(named="wok.mobile.bff.jar",matches=".+")
class MobileCoreBoundaryIntegrationTest extends PostgresIntegrationTest {
    @Test void clientQuoteHoldRecoveryOwnershipAndPhoneFailClosedCrossAllBoundaries() throws Exception {
        UUID client=createUserWithRole("mobile-core-"+UUID.randomUUID()+"@wok.test","CLIENT");
        jdbc.update("INSERT INTO wok.customer_profiles(user_id,full_name) VALUES(?,'Cliente de prueba')",client);
        jdbc.update("UPDATE wok.users SET phone='+50255550101' WHERE id=?",client);
        UUID other=createUserWithRole("mobile-other-"+UUID.randomUUID()+"@wok.test","CLIENT");
        UUID table=jdbc.queryForObject("INSERT INTO wok.dining_tables(name,capacity,zone) VALUES(?,4,'TEST') RETURNING id",UUID.class,"MOBILE "+UUID.randomUUID());
        int port;try(ServerSocket socket=new ServerSocket(0)){port=socket.getLocalPort();}
        Path mobile=Path.of(System.getProperty("wok.mobile.test.dir")).toAbsolutePath();
        Path output=Path.of(System.getProperty("wok.boundary.output.dir")).toAbsolutePath();
        String origin="http://127.0.0.1:"+port;
        Process bff=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java.exe").toString(),
                "-jar",System.getProperty("wok.mobile.bff.jar"),"--server.address=127.0.0.1","--server.port="+port,
                "--wok.bff.core-base-url="+baseUrl()).redirectErrorStream(true).redirectOutput(output.resolve("mobile-boundary-bff.log").toFile()).start();
        try {
            var http=HttpClient.newHttpClient();boolean ready=false;long deadline=System.nanoTime()+Duration.ofSeconds(40).toNanos();
            while(bff.isAlive()&&System.nanoTime()<deadline){
                try{ready=http.send(HttpRequest.newBuilder(URI.create(origin+"/actuator/health")).timeout(Duration.ofSeconds(2)).GET().build(),HttpResponse.BodyHandlers.discarding()).statusCode()==200;if(ready)break;}catch(Exception unavailable){}
                Thread.sleep(200);
            }
            assertThat(ready).as("BFF aislado disponible").isTrue();
            String slot=LocalDate.now(ZoneId.of("America/Guatemala")).plusDays(2).atTime(18,0).atZone(ZoneId.of("America/Guatemala")).toInstant().toString();
            Process journey=new ProcessBuilder(NodeRuntime.executable(),mobile.resolve("tests/mobile-core-boundary.cjs").toString(),
                    origin,tokenFor(client),tokenFor(other),slot).directory(mobile.toFile()).redirectErrorStream(true)
                    .redirectOutput(output.resolve("mobile-boundary-journey.log").toFile()).start();
            try{assertThat(journey.waitFor(40,TimeUnit.SECONDS)).isTrue();assertThat(journey.exitValue()).isZero();}
            finally{if(journey.isAlive())journey.destroyForcibly();}
            assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.reservation_capacity_holds h JOIN wok.reservations r ON r.id=h.reservation_id JOIN wok.customer_profiles cp ON cp.id=r.customer_id WHERE cp.user_id=?",Integer.class,client)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.reservations r JOIN wok.customer_profiles cp ON cp.id=r.customer_id WHERE cp.user_id=? AND r.preorder_order_id IS NOT NULL",Integer.class,client)).isZero();
        } finally {
            bff.destroy();if(!bff.waitFor(10,TimeUnit.SECONDS)){bff.destroyForcibly();bff.waitFor(10,TimeUnit.SECONDS);}
            jdbc.update("UPDATE wok.dining_tables SET active=false WHERE id=?",table);
        }
    }
}
