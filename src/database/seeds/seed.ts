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

  // Seed UrbaneBolt provider
  const existingUb = await courierRepo.findOne({ where: { code: 'urbanebolt' } });
  const ubData = {
    code: 'urbanebolt',
    displayName: 'UrbaneBolt',
    isActive: true,
    baseUrl: process.env.URBANEBOLT_BASE_URL ?? 'https://uat.urbanebolt.in/api/v1',
    courierConfig: {
      authType: CourierAuthType.BEARER_TOKEN,
      authEndpoint: '/auth/getToken/',
      authCredentials: {
        username: process.env.URBANEBOLT_USERNAME ?? 'info@urbanebolt.com',
        password: process.env.URBANEBOLT_PASSWORD ?? 'EKIcygsLVV5RCtPZ',
      },
      customerCode: process.env.URBANEBOLT_CUSTOMER_CODE ?? 'UEBCUS0008',
    },
    timeoutMs: 10000,
    maxRetries: 3,
    retryBackoffMs: 1000,
    retryBackoffMultiplier: 2.0,
    maxBackoffMs: 30000,
  };
  if (!existingUb) {
    const ub = courierRepo.create(ubData);
    await courierRepo.save(ub);
    process.stdout.write('✅ UrbaneBolt courier provider seeded\n');
  } else {
    Object.assign(existingUb, ubData);
    await courierRepo.save(existingUb);
    process.stdout.write('✅ UrbaneBolt courier provider updated\n');
  }

  // Seed MockCourier provider
  const existingMock = await courierRepo.findOne({ where: { code: 'mock' } });
  const mockData = {
    code: 'mock',
    displayName: 'Mock Courier (Testing)',
    isActive: true,
    baseUrl: 'http://mock-courier.internal',
    courierConfig: {
      authType: CourierAuthType.NONE,
    },
    timeoutMs: 5000,
    maxRetries: 1,
    retryBackoffMs: 500,
    retryBackoffMultiplier: 1.5,
    maxBackoffMs: 5000,
  };
  if (!existingMock) {
    const mock = courierRepo.create(mockData);
    await courierRepo.save(mock);
    process.stdout.write('✅ MockCourier provider seeded\n');
  } else {
    Object.assign(existingMock, mockData);
    await courierRepo.save(existingMock);
    process.stdout.write('✅ MockCourier provider updated\n');
  }

  await AppDataSource.destroy();
  process.stdout.write('✅ Seed complete\n');
}

void seed().catch((err: unknown) => {
  process.stderr.write(`Seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
