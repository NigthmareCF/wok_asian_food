package com.wokasianfood.api.support;
import java.nio.file.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Manually selected harness: synthetic accounts, fresh DB, bounded lifetime. Excluded from normal *Test suite. */
class CandidateBrowserHarness extends PostgresIntegrationTest {
    @Autowired PasswordEncoder encoder;
    @Test void serveExactCandidateForBrowser()throws Exception {
        Path directory=Path.of(System.getProperty("wok.candidate.harnessDir"));Files.createDirectories(directory);
        for(String role:new String[]{"CLIENT","ADMIN"}){
            String email="candidate-"+role.toLowerCase()+"@wok.test";UUID id=createUserWithRole(email,role);
            jdbc.update("INSERT INTO wok.user_credentials(user_id,password_hash) VALUES(?,?)",id,encoder.encode("SyntheticTestOnly2026!"));
            if(role.equals("CLIENT")){jdbc.update("UPDATE wok.users SET phone='+50255550101' WHERE id=?",id);jdbc.update("INSERT INTO wok.customer_profiles(user_id,full_name) VALUES(?,'Cliente sintético de auditoría')",id);}
        }
        jdbc.update("INSERT INTO wok.service_capabilities(code,status) VALUES('PICKUP','ENABLED'),('DELIVERY','ENABLED') ON CONFLICT(code) DO UPDATE SET status='ENABLED',effective_until=NULL");
        jdbc.update("INSERT INTO wok.business_hours(service_type,weekday,opens_at,closes_at,timezone_name) SELECT 'RESTAURANT',day,'14:00'::time,'22:00'::time,'America/Guatemala' FROM generate_series(1,7) day");
        jdbc.update("INSERT INTO wok.dining_tables(name,capacity,zone) VALUES('Mesa candidata',4,'TEST')");
        jdbc.update("INSERT INTO wok.item_types(code,name) VALUES('DISH','Plato') ON CONFLICT DO NOTHING");jdbc.update("INSERT INTO wok.units(code,name,dimension,factor_to_base) VALUES('UNIT','Unidad','COUNT',1) ON CONFLICT DO NOTHING");
        UUID item=jdbc.queryForObject("INSERT INTO wok.items(sku,name,item_type_id,base_unit_id) SELECT 'CANDIDATE_WOK','Wok sintético',t.id,u.id FROM wok.item_types t,wok.units u WHERE t.code='DISH' AND u.code='UNIT' RETURNING id",UUID.class);
        UUID area=jdbc.queryForObject("INSERT INTO wok.preparation_areas(code,name) VALUES('CANDIDATE','Cocina candidata') RETURNING id",UUID.class),category=jdbc.queryForObject("INSERT INTO wok.menu_categories(name) VALUES('Menú candidato') RETURNING id",UUID.class);
        jdbc.update("INSERT INTO wok.menu_items(item_id,category_id,preparation_area_id,name,price,currency_id,visibility,status,estimated_preparation_seconds) SELECT ?,?,?,'Wok sintético',20,id,'PUBLIC','ACTIVE',60 FROM wok.currencies WHERE code='GTQ'",item,category,area);
        Files.writeString(directory.resolve("browser-api.json"),"{\"apiBase\":\""+baseUrl()+"\",\"database\":\"fresh Testcontainers only\"}");
        long deadline=System.currentTimeMillis()+12*60*1000;
        while(!Files.exists(directory.resolve("browser-stop"))&&System.currentTimeMillis()<deadline)Thread.sleep(250);
        if(!Files.exists(directory.resolve("browser-stop")))throw new IllegalStateException("Browser harness timed out; no browser PASS implied");
    }
}
