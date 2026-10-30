import { beforeAll, describe, expect, it } from 'vitest';

process.env = {
  ...process.env,
  NODE_ENV: 'test',
  API_URL: 'https://api.mycommuniti.org',
  WEB_URL: 'https://app.mycommuniti.org',
  ADMIN_URL: 'https://admin.mycommuniti.org',
  DATABASE_URL: 'postgres://unused',
  JWT_ACCESS_SECRET: 'x'.repeat(64),
  VERIFICATION_NETWORK_CHECKS: 'false',
};

type Engine = typeof import('../../src/modules/verification/engine.js');
type Text = typeof import('../../src/modules/verification/text.js');
type Orcid = typeof import('../../src/modules/verification/orcid.js');
type Net = typeof import('../../src/modules/verification/net.js');
type Unis = typeof import('../../src/modules/verification/universities.js');
let engine: Engine;
let text: Text;
let orcid: Orcid;
let net: Net;
let unis: Unis;

beforeAll(async () => {
  engine = await import('../../src/modules/verification/engine.js');
  text = await import('../../src/modules/verification/text.js');
  orcid = await import('../../src/modules/verification/orcid.js');
  net = await import('../../src/modules/verification/net.js');
  unis = await import('../../src/modules/verification/universities.js');
});

const subject = { userId: '00000000-0000-7000-8000-000000000001', fullName: 'Adaeze Okafor', accountEmail: 'adaeze@gmail.com' };
const offline = { network: false };

describe('text plausibility', () => {
  it.each([
    'University of Lagos', 'Ahmadu Bello University', 'Yaba College of Technology', 'UNILAG', 'FUTA', 'Computer Science', 'MBBS', 'Business administration',
    'Machinist', 'CEO', 'Software Engineer', 'Dangote Group', 'MTN Nigeria', 'Green Hill Solutions', 'Kpakpando Ventures', 'Nkwerre', 'Mgbidi', 'Psychology',
  ])('accepts "%s"', (v) => expect(text.assessText(v, 'label').ok).toBe(true));

  it.each(['asdfgh', 'qwerty', 'test', 'n/a', 'aaaa', 'sdfghjkl', 'jkjkjkjk', 'xcvbnm company', 'lorem ipsum dolor', 'hjkl', 'bcdfgh', 'zzzzzz', 'fdsa fdsa', '....', '12345', 'abc', 'none'])(
    'rejects "%s"',
    (v) => expect(text.assessText(v, 'label').ok).toBe(false),
  );

  it.each(['Adaeze Okafor', 'Nnamdi Azikiwe', 'Oluwaseun Adébáyọ̀', 'Ngozi Okonjo-Iweala', "Chi'Chi O'Neil", 'Shehu Musa', 'Tsoho Bello', 'Gbenga Daniel'])('accepts the name "%s"', (n) =>
    expect(text.assessText(n, 'person').ok).toBe(true),
  );
  it.each(['John123', 'asdf ghjk', '@@@', 'Test User', 'qwerty'])('rejects the name "%s"', (n) => expect(text.assessText(n, 'person').ok).toBe(false));

  it.each(['200', '200L', '300 level', 'Year 2', 'Final year', 'HND 1', 'ND2', 'SS3', 'MSc', 'PhD'])('accepts the level "%s"', (l) => expect(text.assessLevel(l).ok).toBe(true));
  it.each(['12345', 'asdf', '999'])('rejects the level "%s"', (l) => expect(text.assessLevel(l).ok).toBe(false));

  it('matches names across spellings and initials', () => {
    expect(text.namesMatch('Adaeze Okafor', 'A. Okafor')).toBe(true);
    expect(text.namesMatch('Mohammed Bello', 'Muhammad Bello')).toBe(true);
    expect(text.namesMatch('Oluwaseun Adébáyọ̀', 'Oluwaseun Adebayo')).toBe(true);
    expect(text.namesMatch('Ada Obi', 'John Smith')).toBe(false);
  });

  it('matches email domains to organisations', () => {
    expect(text.domainMatchesOrg('unilag.edu.ng', 'University of Lagos')).toBe(true);
    expect(text.domainMatchesOrg('futa.edu.ng', 'Federal University of Technology Akure')).toBe(true);
    expect(text.domainMatchesOrg('dangote.com', 'Dangote Group')).toBe(true);
    expect(text.domainMatchesOrg('gmail.com', 'University of Lagos')).toBe(false);
  });
});

describe('reference data', () => {
  it('finds universities by domain and acronym', () => {
    expect(unis.universityByDomain('cs.abu.edu.ng')?.name).toBe('Ahmadu Bello University');
    expect(unis.universityByName('Ahmadu Bello University')?.domains).toContain('abu.edu.ng');
    expect(unis.domainKind('unilag.edu.ng')).toBe('academic');
    expect(unis.domainKind('ox.ac.uk')).toBe('academic');
    expect(unis.domainKind('startup.ac')).toBe('other');
    expect(unis.domainKind('nitda.gov.ng')).toBe('government');
  });

  it('every listed university name passes the text check', async () => {
    const { UNIVERSITIES } = await import('../../src/modules/verification/data/universities.js');
    const rejected = UNIVERSITIES.split('\n').filter((l) => !text.assessText(l.split('|')[0]!, 'label').ok);
    expect(rejected).toEqual([]);
  });
});

describe('ORCID', () => {
  it('validates the ISO 7064 checksum', () => {
    expect(orcid.isValidOrcid('0000-0002-1825-0097')).toBe(true);
    expect(orcid.isValidOrcid('0000-0002-1825-0098')).toBe(false);
    expect(orcid.isValidOrcid('0000-0001-5109-3700')).toBe(true);
    expect(orcid.isValidOrcid('1234')).toBe(false);
  });
  it('knows the issued ranges', () => {
    expect(orcid.isInIssuedRange('0000-0002-1825-0097')).toBe(true);
    expect(orcid.isInIssuedRange('0000-0006-0000-0004')).toBe(false);
    expect(orcid.isInIssuedRange('0009-0001-2345-6789')).toBe(true);
  });
});

describe('network guards', () => {
  it('refuses private and reserved hosts', async () => {
    expect(net.isPrivateAddress('127.0.0.1')).toBe(true);
    expect(net.isPrivateAddress('10.1.2.3')).toBe(true);
    expect(net.isPrivateAddress('169.254.169.254')).toBe(true);
    expect(net.isPrivateAddress('::1')).toBe(true);
    expect(net.isPrivateAddress('::ffff:192.168.0.1')).toBe(true);
    expect(net.isPrivateAddress('41.58.1.1')).toBe(false);
    expect(net.isReservedHost('example.com')).toBe(true);
    expect(net.isReservedHost('intranet.local')).toBe(true);
    expect(net.isReservedHost('unilag.edu.ng')).toBe(false);
    expect((await net.safeFetch('http://127.0.0.1:4000/')).failure).toBe('blocked');
    expect((await net.safeFetch('http://localhost/')).failure).toMatch(/blocked|network/);
    expect((await net.safeFetch('file:///etc/passwd')).failure).toBe('blocked');
  });
});

describe('role assessment (offline rules)', () => {
  it('verifies a solid researcher form', async () => {
    const a = await engine.assessRole(
      { memberRole: 'researcher', details: { institutionalEmail: 'a.okafor@unilag.edu.ng', orcidId: '0000-0002-1825-0097', researchEvidence: 'Soil health and cassava yields in Kano' } },
      subject,
      offline,
    );
    expect(a.decision).toBe('verified');
    expect(a.score).toBeGreaterThanOrEqual(60);
    expect(a.fieldErrors).toEqual({});
  });

  it('rejects a bad ORCID checksum, a Gmail institutional email and gibberish evidence, field by field', async () => {
    const a = await engine.assessRole({ memberRole: 'researcher', details: { institutionalEmail: 'ada@gmail.com', orcidId: '0000-0002-1825-0098', researchEvidence: 'asdfgh jkl' } }, subject, offline);
    expect(a.decision).toBe('rejected');
    expect(Object.keys(a.fieldErrors).sort()).toEqual(['details.institutionalEmail', 'details.orcidId', 'details.researchEvidence']);
  });

  it('rejects disposable and placeholder domains', async () => {
    const a = await engine.assessRole({ memberRole: 'learner', details: { institution: 'University of Lagos', courseOfStudy: 'Computer Science', studentEmail: 'me@mailinator.com' } }, subject, offline);
    expect(a.fieldErrors['details.studentEmail']).toMatch(/disposable/i);
    const b = await engine.assessRole({ memberRole: 'professional', details: { organizationName: 'Dangote Group', professionalTitle: 'Engineer', workEmail: 'me@example.com' } }, subject, offline);
    expect(b.fieldErrors['details.workEmail']).toMatch(/not a real email domain/);
  });

  it('rejects unsafe or fake links and non-profile LinkedIn URLs', async () => {
    const a = await engine.assessRole({ memberRole: 'professional', details: { organizationName: 'Dangote Group', professionalTitle: 'Engineer', profileLink: 'https://www.linkedin.com/feed/' } }, subject, offline);
    expect(a.fieldErrors['details.profileLink']).toMatch(/LinkedIn profile/);
    const b = await engine.assessRole({ memberRole: 'innovator', details: { ventureName: 'Green Hill', developmentStage: 'open', evidenceLink: 'http://192.168.1.1/admin', evidenceFileIds: [], otherCueFileIds: [] } }, subject, offline);
    expect(b.fieldErrors['details.evidenceLink']).toMatch(/public website/);
  });

  it('accepts a real LinkedIn profile and credits a slug that carries the name', async () => {
    const a = await engine.assessRole({ memberRole: 'professional', details: { organizationName: 'Dangote Group', professionalTitle: 'Process Engineer', profileLink: 'https://www.linkedin.com/in/adaeze-okafor-123' } }, subject, offline);
    expect(a.decision).toBe('verified');
    expect(a.checks.some((c) => c.check === 'link_mentions' && c.outcome === 'pass')).toBe(true);
  });

  it('rejects a duplicate ORCID or email used by another account', async () => {
    const a = await engine.assessRole({ memberRole: 'researcher', details: { orcidId: '0000-0002-1825-0097', institutionalEmail: 'x@unilag.edu.ng' } }, subject, {
      network: false,
      findDuplicates: async () => ({ orcidId: true, emails: new Set(['x@unilag.edu.ng']) }),
    });
    expect(a.fieldErrors['details.orcidId']).toMatch(/another CommUniti account/);
    expect(a.fieldErrors['details.institutionalEmail']).toMatch(/another CommUniti account/);
  });

  it('flags (but still verifies) a form with no independent evidence', async () => {
    const a = await engine.assessRole({ memberRole: 'learner', details: { institution: 'Some Community School', courseOfStudy: 'Agricultural Science', level: 'SS3' } }, subject, offline);
    expect(a.decision).toBe('verified');
    expect(a.checks.some((c) => c.check === 'independent_evidence' && c.outcome === 'warn')).toBe(true);
  });

  it('never rejects because a lookup could not run (no DNS in this environment)', async () => {
    const a = await engine.assessRole(
      { memberRole: 'researcher', details: { institutionalEmail: 'a.okafor@unilag.edu.ng', researchProjectLink: 'https://research.unilag.edu.ng/okafor' } },
      subject,
      { network: true },
    );
    for (const c of a.checks.filter((x) => x.check === 'email_dns' || x.check === 'link_reachable')) expect(['pass', 'skipped']).toContain(c.outcome);
  }, 20_000);
});
