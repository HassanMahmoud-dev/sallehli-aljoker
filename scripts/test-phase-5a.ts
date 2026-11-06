import { checkChannelAccess } from '../src/main/channelPolicy.ts'
import assert from 'node:assert'

console.log('--- Testing Phase 5A: Backend Module Enforcement & Licensing ---')

const appliancesModules = [
  'dashboard',
  'tickets',
  'customers',
  'technicians',
  'inventory',
  'treasury',
  'reports',
  'settings'
]

const hearingAidsModules = [
  'dashboard',
  'sales',
  'purchases',
  'tickets',
  'customers',
  'followups',
  'products',
  'suppliers',
  'technicians',
  'inventory',
  'treasury',
  'reports',
  'settings'
]

const tenantSession = {
  id: 1,
  userId: 2,
  username: 'tenant1',
  role: 'tenant',
  fullName: 'مدير الصيانة',
  loginTime: new Date().toISOString()
}

const storekeeperSession = {
  id: 2,
  userId: 3,
  username: 'storekeeper1',
  role: 'storekeeper',
  fullName: 'أمين المخزن',
  loginTime: new Date().toISOString()
}

// Test 1: In appliances mode, sales channels must be rejected with MODULE_NOT_ALLOWED
{
  const res = checkChannelAccess('sales:list', tenantSession as any, appliancesModules)
  assert.strictEqual(res.allowed, false, 'sales:list should be disallowed in appliances mode')
  assert.match(res.reason || '', /MODULE_NOT_ALLOWED/, 'Reason should specify MODULE_NOT_ALLOWED')
  console.log('✓ Test 1 Passed: sales:list blocked in appliances mode with MODULE_NOT_ALLOWED')
}

// Test 2: In appliances mode, audiology channels must be rejected with MODULE_NOT_ALLOWED
{
  const res = checkChannelAccess('hearingTests:save', tenantSession as any, appliancesModules)
  assert.strictEqual(res.allowed, false, 'hearingTests:save should be disallowed in appliances mode')
  assert.match(res.reason || '', /MODULE_NOT_ALLOWED/, 'Reason should specify MODULE_NOT_ALLOWED')
  console.log('✓ Test 2 Passed: hearingTests:save blocked in appliances mode with MODULE_NOT_ALLOWED')
}

// Test 3: In appliances mode, returns:list must be rejected because neither sales nor purchases is active
{
  const res = checkChannelAccess('returns:list', tenantSession as any, appliancesModules)
  assert.strictEqual(res.allowed, false, 'returns:list should be disallowed when no sales/purchases module active')
  assert.match(res.reason || '', /MODULE_NOT_ALLOWED/, 'Reason should specify MODULE_NOT_ALLOWED')
  console.log('✓ Test 3 Passed: returns:list blocked in appliances mode with MODULE_NOT_ALLOWED')
}

// Test 4: In appliances mode, tickets channel is allowed
{
  const res = checkChannelAccess('tickets:list', tenantSession as any, appliancesModules)
  assert.strictEqual(res.allowed, true, 'tickets:list should be allowed in appliances mode')
  console.log('✓ Test 4 Passed: tickets:list allowed in appliances mode')
}

// Test 5: In hearing_aids mode, sales channels are allowed for tenant
{
  const res = checkChannelAccess('sales:list', tenantSession as any, hearingAidsModules)
  assert.strictEqual(res.allowed, true, 'sales:list should be allowed in hearing_aids mode')
  console.log('✓ Test 5 Passed: sales:list allowed in hearing_aids mode')
}

// Test 6: In hearing_aids mode, medical audiology channel is blocked for storekeeper (Role check)
{
  const res = checkChannelAccess('hearingTests:save', storekeeperSession as any, hearingAidsModules)
  assert.strictEqual(res.allowed, false, 'hearingTests:save must be blocked for storekeeper')
  console.log('✓ Test 6 Passed: hearingTests:save blocked for storekeeper role even in hearing_aids mode')
}

// Test 7: In appliances mode with add-on licensed sales module, sales channels become allowed
{
  const appliancesWithSales = [...appliancesModules, 'sales']
  const res = checkChannelAccess('sales:list', tenantSession as any, appliancesWithSales)
  assert.strictEqual(res.allowed, true, 'sales:list should be allowed when sales module is licensed')
  console.log('✓ Test 7 Passed: sales:list allowed when licensed_modules includes sales')
}

console.log('\nAll Phase 5A verification tests passed successfully! 🎉')
