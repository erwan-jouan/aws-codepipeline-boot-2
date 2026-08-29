package bluegreen;

import bluegreen.conf.dynamodb.ExamProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.function.serverless.web.ServerlessAutoConfiguration;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.Bean;
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer;
import org.springframework.core.io.ClassPathResource;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(exclude = ServerlessAutoConfiguration.class)
@EnableFeignClients
@EnableScheduling
@EnableConfigurationProperties(ExamProperties.class)
public class BlueGreenApplication {

    public static void main(final String[] args) {
        SpringApplication.run(BlueGreenApplication.class, args);
    }

    @Bean
    public static PropertySourcesPlaceholderConfigurer placeholderConfigurer() {
        final PropertySourcesPlaceholderConfigurer propsConfig
                = new PropertySourcesPlaceholderConfigurer();
        propsConfig.setLocation(new ClassPathResource("git.properties"));
        propsConfig.setIgnoreResourceNotFound(true);
        propsConfig.setIgnoreUnresolvablePlaceholders(true);
        return propsConfig;
    }

}
