import axios from 'axios';
import { AppDataSource, initDatabase } from '@database/datasource';
import { CourierProvider } from '@database/entities';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🚀 Starting E2E Integration Tests...');
  const results: { test: string; status: string; details?: string }[] = [];

  const logResult = (test: string, success: boolean, details?: string) => {
    const status = success ? '✅ PASSED' : '❌ FAILED';
    results.push({ test, status, details });
    console.log(`${status} - ${test}${details ? ` (${details})` : ''}`);
  };

  try {
    // 1. Health Check
    try {
      const healthRes = await axios.get(`${BASE_URL}/health`);
      logResult('Health Check (GET /health)', healthRes.status === 200, `Status: ${healthRes.status}`);
    } catch (err: any) {
      logResult('Health Check (GET /health)', false, err.message);
    }

    // 2. Login as Admin
    let adminToken = '';
    try {
      const loginRes = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
        email: 'admin@courier.com',
        password: 'Admin@123456',
      });
      adminToken = loginRes.data.data.tokens.accessToken;
      logResult('Login as Admin (POST /api/v1/auth/login)', !!adminToken, 'Token received');
    } catch (err: any) {
      logResult('Login as Admin (POST /api/v1/auth/login)', false, err.response?.data?.message || err.message);
    }

    // 3. Register user without token (should fail)
    try {
      await axios.post(`${BASE_URL}/api/v1/auth/register`, {
        email: `ops-${Date.now()}@courier.com`,
        password: 'Ops@123456',
        role: 'OPS',
      });
      logResult('Register without token (should block)', false, 'User registered unexpectedly');
    } catch (err: any) {
      const success = err.response?.status === 401;
      logResult('Register without token (should block)', success, `Status: ${err.response?.status}`);
    }

    // 4. Register user with Admin token
    const testEmail = `ops-${Date.now()}@courier.com`;
    const testPassword = 'Ops@123456';
    try {
      const regRes = await axios.post(
        `${BASE_URL}/api/v1/auth/register`,
        {
          email: testEmail,
          password: testPassword,
          role: 'OPS',
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      logResult('Register with Admin token (POST /api/v1/auth/register)', regRes.status === 201, `Created user: ${testEmail}`);
    } catch (err: any) {
      logResult('Register with Admin token (POST /api/v1/auth/register)', false, err.response?.data?.message || err.message);
    }

    // 5. Login as New User
    let opsToken = '';
    try {
      const loginRes = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
        email: testEmail,
        password: testPassword,
      });
      opsToken = loginRes.data.data.tokens.accessToken;
      logResult('Login as New OPS User (POST /api/v1/auth/login)', !!opsToken, 'Token received');
    } catch (err: any) {
      logResult('Login as New OPS User (POST /api/v1/auth/login)', false, err.response?.data?.message || err.message);
    }

    // 6. Create Order - Mock Courier
    const mockOrderPayload = {
      order_id: `ORD-MOCK-${Date.now()}`,
      courier_partner: 'mock',
      service_type: 'SDD',
      payment_mode: 'PREPAID',
      declared_value: 1500,
      collectable_value: 0,
      item_description: 'Electronics',
      item_quantity: 1,
      weight: 0.5,
      dimensions: { length: 20, breadth: 15, height: 10 },
      invoice: { number: `INV-${Date.now()}`, date: '2026-06-12', value: 1500 },
      shipper: {
        name: 'Acme Store',
        email: 'store@acme.com',
        mobile: '9876543210',
        address: '123 MG Road',
        address_type: 'COMMERCIAL',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        country: 'India',
      },
      consignee: {
        name: 'John Doe',
        email: 'john@example.com',
        mobile: '9123456789',
        address: '456 Park Street',
        address_type: 'RESIDENTIAL',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        country: 'India',
      },
      return_address: {
        name: 'Acme Returns',
        email: 'returns@acme.com',
        mobile: '9876543210',
        address: '123 MG Road',
        address_type: 'COMMERCIAL',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        country: 'India',
      },
    };

    let mockOrderId = '';
    let mockTrackOrderId = '';
    try {
      const orderRes = await axios.post(`${BASE_URL}/api/v1/orders`, mockOrderPayload, {
        headers: { Authorization: `Bearer ${opsToken}` },
      });
      mockOrderId = orderRes.data.data.order_id;
      logResult('Create Order - Mock Courier (POST /api/v1/orders)', orderRes.status === 201, `ID: ${mockOrderId}`);
    } catch (err: any) {
      logResult('Create Order - Mock Courier (POST /api/v1/orders)', false, err.response?.data?.message || err.message);
    }

    try {
      const trackOrderRes = await axios.post(
        `${BASE_URL}/api/v1/orders`,
        {
          ...mockOrderPayload,
          order_id: `ORD-MOCK-TRACK-${Date.now()}`,
        },
        { headers: { Authorization: `Bearer ${opsToken}` } }
      );
      mockTrackOrderId = trackOrderRes.data.data.order_id;
    } catch (err: any) {
      // ignore
    }

    // 7. Create Order - UrbaneBolt Courier
    const ubOrderPayload = {
      ...mockOrderPayload,
      order_id: `ORD-UB-${Date.now()}`,
      courier_partner: 'urbanebolt',
      payment_mode: 'COD',
      collectable_value: 1500,
    };

    let ubOrderId = '';
    try {
      const orderRes = await axios.post(`${BASE_URL}/api/v1/orders`, ubOrderPayload, {
        headers: { Authorization: `Bearer ${opsToken}` },
      });
      ubOrderId = orderRes.data.data.order_id;
      logResult('Create Order - UrbaneBolt (POST /api/v1/orders)', orderRes.status === 201, `ID: ${ubOrderId}`);
    } catch (err: any) {
      logResult('Create Order - UrbaneBolt (POST /api/v1/orders)', false, err.response?.data?.message || err.message);
    }

    // 8. Track Order
    if (mockTrackOrderId) {
      try {
        const trackRes = await axios.get(`${BASE_URL}/api/v1/orders/${mockTrackOrderId}/track`, {
          headers: { Authorization: `Bearer ${opsToken}` },
        });
        logResult('Track Order - Mock Courier (GET /api/v1/orders/:id/track)', trackRes.status === 200, `Status: ${trackRes.data.data.status}`);
      } catch (err: any) {
        logResult('Track Order - Mock Courier (GET /api/v1/orders/:id/track)', false, err.response?.data?.message || err.message);
      }
    }

    // 9. Get Orders by Courier Partner
    try {
      const partnerRes = await axios.get(`${BASE_URL}/api/v1/orders/partner/mock?page=1&limit=5`, {
        headers: { Authorization: `Bearer ${opsToken}` },
      });
      logResult('Get Orders by Partner (GET /api/v1/orders/partner/:partner)', partnerRes.status === 200, `Count: ${partnerRes.data.data.length}`);
    } catch (err: any) {
      logResult('Get Orders by Partner (GET /api/v1/orders/partner/:partner)', false, err.response?.data?.message || err.message);
    }

    // 10. Bulk Create Orders
    let batchId = '';
    try {
      const bulkPayload = {
        orders: [
          {
            ...mockOrderPayload,
            order_id: `BULK-MOCK-1-${Date.now()}`,
          },
          {
            ...mockOrderPayload,
            order_id: `BULK-MOCK-2-${Date.now()}`,
          },
        ],
      };
      const bulkRes = await axios.post(`${BASE_URL}/api/v1/orders/bulk`, bulkPayload, {
        headers: { Authorization: `Bearer ${opsToken}` },
      });
      batchId = bulkRes.data.data.batchId;
      logResult('Bulk Create Orders (POST /api/v1/orders/bulk)', bulkRes.status === 202, `Batch ID: ${batchId}`);
    } catch (err: any) {
      logResult('Bulk Create Orders (POST /api/v1/orders/bulk)', false, err.response?.data?.message || err.message);
    }

    // 11. Get Batch Status
    if (batchId) {
      try {
        const batchRes = await axios.get(`${BASE_URL}/api/v1/batches/${batchId}`, {
          headers: { Authorization: `Bearer ${opsToken}` },
        });
        logResult('Get Batch Status (GET /api/v1/batches/:id)', batchRes.status === 200, `Status: ${batchRes.data.data.status}`);
      } catch (err: any) {
        logResult('Get Batch Status (GET /api/v1/batches/:id)', false, err.response?.data?.message || err.message);
      }
    }

    // 12. Cancel Order
    if (mockOrderId) {
      try {
        const cancelRes = await axios.post(
          `${BASE_URL}/api/v1/orders/${mockOrderId}/cancel`,
          { reason: 'Customer requested cancellation' },
          { headers: { Authorization: `Bearer ${opsToken}` } }
        );
        logResult('Cancel Order (POST /api/v1/orders/:id/cancel)', cancelRes.status === 200, 'Cancelled');
      } catch (err: any) {
        logResult('Cancel Order (POST /api/v1/orders/:id/cancel)', false, err.response?.data ? JSON.stringify(err.response.data) : err.message);
      }
    }

    // 13. Database Encryption Verification
    console.log('\n🔍 Verifying Database Configuration Encryption...');
    await initDatabase();

    // Raw SQL query to check raw stored value in postgres
    const rawProviders = await AppDataSource.query('SELECT code, courier_config FROM courier_providers');
    
    // TypeORM fetch to check decrypted value
    const providerRepo = AppDataSource.getRepository(CourierProvider);
    const typeormProviders = await providerRepo.find();

    let encryptionVerified = true;
    for (const raw of rawProviders) {
      const typeormMatch = typeormProviders.find(p => p.code === raw.code);
      if (!typeormMatch) {
        encryptionVerified = false;
        console.log(`❌ Provider ${raw.code} not found in TypeORM fetch`);
        continue;
      }

      const rawConfig = raw.courier_config;
      const decConfig = typeormMatch.courierConfig;

      if (raw.code === 'urbanebolt') {
        // Raw should have encrypted format: iv:tag:ciphertext
        const isRawEncrypted = typeof rawConfig === 'string' && rawConfig.split(':').length === 3;
        const isDecryptedCorrect = decConfig && typeof decConfig === 'object' && 'authType' in decConfig;

        if (isRawEncrypted && isDecryptedCorrect) {
          console.log(`✅ UrbaneBolt: Raw database value is encrypted. Decrypted value has root authType.`);
        } else {
          encryptionVerified = false;
          console.log(`❌ UrbaneBolt: Encryption/Decryption mismatch. Raw:`, rawConfig, `Decrypted:`, decConfig);
        }
      } else if (raw.code === 'mock') {
        // Raw should have encrypted format: iv:tag:ciphertext
        const isRawEncrypted = typeof rawConfig === 'string' && rawConfig.split(':').length === 3;
        const isDecryptedCorrect = decConfig && typeof decConfig === 'object' && 'authType' in decConfig;

        if (isRawEncrypted && isDecryptedCorrect) {
          console.log(`✅ Mock: Raw database value is encrypted. Decrypted value has root authType.`);
        } else {
          encryptionVerified = false;
          console.log(`❌ Mock: Encryption/Decryption mismatch. Raw:`, rawConfig, `Decrypted:`, decConfig);
        }
      }
    }

    logResult('Database Credentials Encryption Verification', encryptionVerified);

  } catch (err: any) {
    console.error('Unexpected error during E2E verification:', err);
  } finally {
    await AppDataSource.destroy();
    
    console.log('\n==================================================');
    console.log('                 TEST RESULTS SUMMARY             ');
    console.log('==================================================');
    console.table(results);
    console.log('==================================================\n');
  }
}

runTests();
