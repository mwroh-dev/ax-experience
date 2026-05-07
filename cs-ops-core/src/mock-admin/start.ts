// cs-ops-core/src/mock-admin/start.ts
import { create_mock_admin_app } from './server';

const PORT = parseInt(process.env.MOCK_ADMIN_PORT ?? '3099', 10);
const app = create_mock_admin_app();

app.listen(PORT, () => {
  console.log(`[mock-admin] Server running on port ${PORT}`);
  console.log(`[mock-admin] Routes:`);
  console.log(`  GET /admin/orders/:orderId/status`);
  console.log(`  GET /admin/customers/lookup?email=`);
  console.log(`  GET /admin/refunds/eligibility?orderId=`);
});
