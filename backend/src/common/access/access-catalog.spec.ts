import { resolveModuleStates, resolveNavigation } from './access-catalog';

describe('access catalog navigation', () => {
  it('shows Lead Management, and the WhatsApp templates leads share, for roles that can view leads', () => {
    expect(resolveNavigation(['leads.view'], resolveModuleStates({})).map((entry) => entry.id)).toEqual(['crm', 'crm.leads', 'crm.whatsapp']);
  });
});
