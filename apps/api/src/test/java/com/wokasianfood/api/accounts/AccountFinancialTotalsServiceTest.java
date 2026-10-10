package com.wokasianfood.api.accounts;
import static org.assertj.core.api.Assertions.*;
import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
class AccountFinancialTotalsServiceTest {
    private AccountFinancialTotalsService.CurrencyTotal total(String currency,String consumed,String paid) {
        BigDecimal t=new BigDecimal(consumed),p=new BigDecimal(paid);
        return new AccountFinancialTotalsService.CurrencyTotal(currency,t,p,t.subtract(p),BigDecimal.ZERO);
    }
    @Test void opposingCurrencyBalancesCannotCancelEachOther() {
        var totals=new AccountFinancialTotalsService.Totals(List.of(total("GTQ","100","0"),total("USD","0","100")));
        assertThat(totals.single()).isNull();
        assertThatThrownBy(totals::requireSettled).isInstanceOf(AuthException.class).hasMessageContaining("conciliación");
        UUID payment=UUID.randomUUID();
        assertThatThrownBy(()->totals.receiptBalance(payment,"USD")).isInstanceOf(AuthException.class).hasMessageContaining(payment.toString());
    }
    @Test void partialPaymentIsNotSettledButItsReceiptHasAValidBalance() {
        var totals=new AccountFinancialTotalsService.Totals(List.of(total("GTQ","100.30","40.10")));
        assertThat(totals.receiptBalance(UUID.randomUUID(),"GTQ")).isEqualByComparingTo("60.20");
        assertThatThrownBy(totals::requireSettled).isInstanceOf(AuthException.class);
    }
    @Test void zeroBalanceIncludingAnEmptyAccountRemainsSettled() {
        new AccountFinancialTotalsService.Totals(List.of()).requireSettled();
        new AccountFinancialTotalsService.Totals(List.of(total("GTQ","100.30","100.30"))).requireSettled();
    }
    @Test void negativeBalanceAndWrongReceiptCurrencyAreAnomalies() {
        var totals=new AccountFinancialTotalsService.Totals(List.of(total("GTQ","10","11")));
        assertThatThrownBy(totals::requireSettled).isInstanceOf(AuthException.class).hasMessageContaining("conciliación");
        var settled=new AccountFinancialTotalsService.Totals(List.of(total("GTQ","10","10")));
        assertThatThrownBy(()->settled.receiptBalance(UUID.randomUUID(),"USD")).isInstanceOf(AuthException.class);
    }
}
