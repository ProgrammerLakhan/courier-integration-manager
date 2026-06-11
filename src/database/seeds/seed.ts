import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import { initDatabase, AppDataSource } from '../datasource';
import { User, UserRole, CourierProvider, CourierAuthType } from '../entities';
import { config } from '@config';

async function seed(): Promise<void> {
  await initDatabase();
  process.stdout.write('✅ Database connected\n');

  const userRepo = AppDataSource.getRepository(User);
  const courierRepo = AppDataSource.getRepository(CourierProvider);

  // Seed ADMIN user
  const existingAdmin = await userRepo.findOne({ where: { email: config.admin.email } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(config.admin.password, 12);
    const admin = userRepo.create({
      email: config.admin.email,
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    });
    await userRepo.save(admin);
    process.stdout.write(`✅ Admin user created: ${config.admin.email}\n`);
  } else {
    process.stdout.write(`ℹ️  Admin user already exists: ${config.admin.email}\n`);
  }

  // Seed UrbaneBolt courier provider
  const existingUB = await courierRepo.findOne({ where: { code: 'urbanebolt' } });
  if (!existingUB) {
    const ub = courierRepo.create({
      code: 'urbanebolt',
      displayName: 'UrbaneBolt',
      isActive: true,
      baseUrl: process.env.URBANEBOLT_BASE_URL ?? 'https://uat.urbanebolt.in/api/v1',
      authType: CourierAuthType.BEARER_TOKEN,
      authEndpoint: '/auth/getToken/',
      authCredentials: {
        username: process.env.URBANEBOLT_USERNAME ?? 'info@urbanebolt.com',
        password: process.env.URBANEBOLT_PASSWORD ?? 'EKIcygsLVV5RCtPZ',
      },
      timeoutMs: 10000,
      maxRetries: 3,
      retryBackoffMs: 1000,
      retryBackoffMultiplier: 2.0,
      maxBackoffMs: 30000,
      extraConfig: {
        customerCode: process.env.URBANEBOLT_CUSTOMER_CODE ?? 'UEBCUS0008',
      },
    });
    await courierRepo.save(ub);
    process.stdout.write('✅ UrbaneBolt courier provider seeded\n');
  } else {
    process.stdout.write('ℹ️  UrbaneBolt courier provider already exists\n');
  }

  // Seed MockCourier provider
  const existingMock = await courierRepo.findOne({ where: { code: 'mock' } });
  if (!existingMock) {
    const mock = courierRepo.create({
      code: 'mock',
      displayName: 'Mock Courier (Testing)',
      isActive: true,
      baseUrl: 'http://mock-courier.internal',
      authType: CourierAuthType.NONE,
      authEndpoint: null,
      authCredentials: null,
      timeoutMs: 5000,
      maxRetries: 1,
      retryBackoffMs: 500,
      retryBackoffMultiplier: 1.5,
      maxBackoffMs: 5000,
      extraConfig: {},
    });
    await courierRepo.save(mock);
    process.stdout.write('✅ MockCourier provider seeded\n');
  } else {
    process.stdout.write('ℹ️  MockCourier provider already exists\n');
  }

  await AppDataSource.destroy();
  process.stdout.write('✅ Seed complete\n');
}

void seed().catch((err: unknown) => {
  process.stderr.write(`Seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
