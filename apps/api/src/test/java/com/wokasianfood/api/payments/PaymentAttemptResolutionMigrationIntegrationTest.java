package com.wokasianfood.api.payments;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class PaymentAttemptResolutionMigrationIntegrationTest {
    PostgreSQLContainer<?> database(){return new PostgreSQLContainer<>("postgres:18-alpine").withDatabaseName("f04b_upgrade").withUsername("f04b").withPassword("f04b_fictitious_password");}
    void migrate(PostgreSQLContainer<?> pg,String target){var config=Flyway.configure().dataSource(pg.getJdbcUrl(),pg.getUsername(),pg.getPassword()).locations("filesystem:../../database/migrations");if(target!=null)config.target(target);config.load().migrate();}
    String scalar(Connection c,String sql)throws Exception{try(var s=c.createStatement();var r=s.executeQuery(sql)){r.next();return r.getString(1);}}
    void sql(Connection c,String sql)throws Exception{try(var s=c.createStatement()){s.execute(sql);}}
    String snapshot(Connection c)throws Exception{return scalar(c,"SELECT jsonb_build_object('attempts',(SELECT jsonb_agg(to_jsonb(a)-ARRAY['resolved_by','resolved_at','resolution_reason','resolution_evidence','resolution_evidence_reference','resolution_expected_version','resolution_physical_receipt_status'] ORDER BY id) FROM wok.payment_attempts a),'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM wok.payments p),'claims',(SELECT jsonb_agg(to_jsonb(k) ORDER BY id) FROM wok.idempotency_keys k),'accounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM wok.order_accounts a),'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM wok.orders o),'audit',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM wok.audit_logs l))::text");}

    @Test void v26RepresentativeStatesAndFinanceSurviveUpgradeAndTransactionalDdlFailure() throws Exception {
        try(var pg=database()) {
            pg.start();migrate(pg,"26");
            try(Connection c=DriverManager.getConnection(pg.getJdbcUrl(),pg.getUsername(),pg.getPassword())) {
                UUID owner=UUID.randomUUID(),responsible=UUID.randomUUID();
                sql(c,"INSERT INTO wok.users(id,email,display_name,status) VALUES ('"+owner+"','v26-owner@f04b.test','F04B owner','ACTIVE'),('"+responsible+"','v26-admin@f04b.test','F04B responsible','ACTIVE')");
                UUID pending=null,confirmed=null;
                for(String state:new String[]{"PREPARED","PENDING","CONFIRMED","REJECTED","RETIRED"}) {
                    UUID account=UUID.randomUUID(),id=UUID.randomUUID(),payment=UUID.randomUUID(),key=UUID.randomUUID();
                    if(state.equals("PENDING"))pending=id;if(state.equals("CONFIRMED"))confirmed=id;
                    sql(c,"INSERT INTO wok.order_accounts(id,name,opened_by) VALUES ('"+account+"','F04B V26 "+state+"','"+owner+"')");
                    sql(c,"INSERT INTO wok.orders(id,code,account_id,channel,status,subtotal,total,currency_id,opened_by,closed_at) SELECT gen_random_uuid(),'F04B-V26-"+state+"','"+account+"','PICKUP','CLOSED',100,100,id,'"+owner+"',now() FROM wok.currencies WHERE code='GTQ'");
                    if(state.equals("CONFIRMED")) {
                        sql(c,"INSERT INTO wok.payments(id,account_id,amount,tip_amount,currency_id,method,captured_by) SELECT '"+payment+"','"+account+"',40,2,id,'TRANSFER','"+owner+"' FROM wok.currencies WHERE code='GTQ'");
                        sql(c,"INSERT INTO wok.idempotency_keys(principal_scope,operation,key,request_hash,status,resource_id,locked_until,expires_at) VALUES ('"+owner+"','ACCOUNT_PAYMENT_CAPTURED','"+key+"','unchanged-v26','COMPLETED','"+payment+"',now(),now()+interval '1 day')");
                    }
                    String requested=state.equals("PENDING")||state.equals("CONFIRMED")||state.equals("REJECTED")?"now()":"null";
                    sql(c,"INSERT INTO wok.payment_attempts(id,account_id,created_by,sequence,amount,tip_amount,currency_id,method,register_code,capture_key,request_hash,legacy,status,row_version,execution_requested_at,payment_id,rejection_status,rejection_message,retired_reason,request_id) SELECT '"+id+"','"+account+"','"+owner+"',1,40,2,id,'TRANSFER','MAIN','"+key+"','unchanged-v26',true,'"+state+"',"+(state.equals("PREPARED")?1:state.equals("CONFIRMED")||state.equals("REJECTED")?3:2)+","+requested+","+(state.equals("CONFIRMED")?"'"+payment+"'::uuid":"null")+","+(state.equals("REJECTED")?"422":"null")+","+(state.equals("REJECTED")?"'Fictitious rejection'":"null")+","+(state.equals("RETIRED")?"'Never requested'":"null")+",gen_random_uuid() FROM wok.currencies WHERE code='GTQ'");
                }
                String before=snapshot(c),oldTrigger=scalar(c,"SELECT pg_get_functiondef('wok.protect_payment_attempt_transition()'::regprocedure)");
                assertThat(scalar(c,"SELECT count(*) FROM pg_constraint WHERE conrelid='wok.payment_attempts'::regclass AND conname='payment_attempts_check'")).isEqualTo("1");
                // Exact migration SQL, followed by an injected failure in a new DB transaction.
                c.setAutoCommit(false);
                sql(c,Files.readString(Path.of("../../database/migrations/V27__presential_payment_attempt_resolution.sql")));
                assertThatThrownBy(()->sql(c,"SELECT 1/0")).isInstanceOf(SQLException.class);c.rollback();c.setAutoCommit(true);
                assertThat(snapshot(c)).isEqualTo(before);assertThat(scalar(c,"SELECT pg_get_functiondef('wok.protect_payment_attempt_transition()'::regprocedure)")).isEqualTo(oldTrigger);
                assertThat(scalar(c,"SELECT count(*) FROM information_schema.columns WHERE table_schema='wok' AND table_name='payment_attempts' AND column_name='resolved_by'")).isEqualTo("0");
                assertThat(scalar(c,"SELECT count(*) FROM wok.permissions WHERE code='payments:resolve'")).isEqualTo("0");
                migrate(pg,null);assertThat(snapshot(c)).isEqualTo(before);
                assertThat(scalar(c,"SELECT count(*) FROM wok.payment_attempts WHERE resolved_by IS NOT NULL")).isEqualTo("0");
                assertThat(scalar(c,"SELECT count(*) FROM pg_indexes WHERE schemaname='wok' AND tablename='payment_attempts' AND indexdef LIKE '%UNIQUE%'")).isEqualTo("6");
                assertThat(scalar(c,"SELECT string_agg(r.code,',') FROM wok.role_permissions rp JOIN wok.roles r ON r.id=rp.role_id JOIN wok.permissions p ON p.id=rp.permission_id WHERE p.code='payments:resolve'")).isEqualTo("ADMIN");
                String marker=scalar(c,"SELECT execution_requested_at FROM wok.payment_attempts WHERE id='"+pending+"'");
                String resolution="UPDATE wok.payment_attempts SET status='RETIRED',retired_reason='F04B checked',row_version=row_version+1,transition_actor='"+responsible+"',resolved_by='"+responsible+"',resolved_at=now(),resolution_reason='F04B checked',resolution_evidence='Fictitious no money receipt',resolution_expected_version=row_version,resolution_physical_receipt_status='NOT_RECEIVED' WHERE id='"+pending+"'";
                assertThatThrownBy(()->sql(c,resolution.replace("resolved_by='"+responsible+"'","resolved_by='"+owner+"'"))).isInstanceOf(SQLException.class);
                assertThatThrownBy(()->sql(c,resolution.replace("status='RETIRED'","execution_requested_at=null,status='RETIRED'"))).isInstanceOf(SQLException.class);
                assertThatThrownBy(()->sql(c,resolution.replace("resolution_evidence='Fictitious no money receipt'","resolution_evidence=null"))).isInstanceOf(SQLException.class);
                assertThatThrownBy(()->sql(c,resolution.replace("'NOT_RECEIVED'","'UNKNOWN'"))).isInstanceOf(SQLException.class);
                String confirmedResolution=resolution.replace(pending.toString(),confirmed.toString());
                assertThatThrownBy(()->sql(c,confirmedResolution)).isInstanceOf(SQLException.class);
                sql(c,resolution);assertThat(scalar(c,"SELECT execution_requested_at FROM wok.payment_attempts WHERE id='"+pending+"'")).isEqualTo(marker);
                String immutableResolution="UPDATE wok.payment_attempts SET resolution_evidence='changed',row_version=row_version+1 WHERE id='"+pending+"'";
                assertThatThrownBy(()->sql(c,immutableResolution)).isInstanceOf(SQLException.class);
                System.out.println("F04B V26->V27: five states, payment/tip/COMPLETED claim unchanged, DDL fault rollback exact, zero backfill, six indexes, marker retained and self-resolution rejected");
            }
        }
    }
    @Test void newPostgresStartsFromZeroThroughV27WithOnlyAdminResolutionPermission() throws Exception {
        try(var pg=database()) {pg.start();migrate(pg,null);try(Connection c=DriverManager.getConnection(pg.getJdbcUrl(),pg.getUsername(),pg.getPassword())) {
            assertThat(scalar(c,"SELECT count(*) FROM public.flyway_schema_history WHERE version='27' AND success")).isEqualTo("1");
            assertThat(scalar(c,"SELECT count(*) FROM wok.payment_attempts")).isEqualTo("0");
            assertThat(scalar(c,"SELECT string_agg(r.code,',') FROM wok.role_permissions rp JOIN wok.roles r ON r.id=rp.role_id JOIN wok.permissions p ON p.id=rp.permission_id WHERE p.code='payments:resolve'")).isEqualTo("ADMIN");
        }}
    }
}
