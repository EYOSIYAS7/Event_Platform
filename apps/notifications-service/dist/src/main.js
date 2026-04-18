"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const microservices_1 = require("@nestjs/microservices");
const common_1 = require("@nestjs/common");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('v1');
    app.connectMicroservice({
        transport: microservices_1.Transport.TCP,
        options: {
            host: '0.0.0.0',
            port: 4005,
        },
    });
    await app.startAllMicroservices();
    await app.listen(process.env.PORT ?? 3005);
    console.log(`Notifications service running on port ${process.env.PORT ?? 3005}`);
}
bootstrap();
//# sourceMappingURL=main.js.map