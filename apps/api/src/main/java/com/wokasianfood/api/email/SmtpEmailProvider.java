package com.wokasianfood.api.email;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnExpression("'${wok.email.mode:mock}' == 'smtp' and '${spring.mail.host:}' != ''")
public class SmtpEmailProvider implements EmailProvider {
    private final JavaMailSender sender;
    public SmtpEmailProvider(JavaMailSender sender) { this.sender = sender; }
    @Override public void send(String recipient, String subject, String body) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(recipient); message.setSubject(subject); message.setText(body);
        sender.send(message);
    }
}
