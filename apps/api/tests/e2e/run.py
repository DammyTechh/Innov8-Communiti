"""End-to-end suite runner: python3 tests/e2e/run.py
Runs every test file in order in one shared namespace (later files reuse users created earlier)
and exits with status 1 if any check failed, so CI blocks the merge."""
import os, sys, time, urllib.request

here = os.path.dirname(os.path.abspath(__file__))
ns = {}
exec(open(os.path.join(here, 'lib.py')).read(), ns)

for _ in range(60):  # wait for the API
    try:
        urllib.request.urlopen(ns['B'] + '/health', timeout=2); break
    except Exception:
        time.sleep(1)
else:
    sys.exit('API did not become healthy')

for name in ['test_auth.py', 'test_cors.py', 'test_modules.py', 'test_extended.py']:
    print(f'\n===== {name} =====')
    try:
        exec(open(os.path.join(here, name)).read(), ns)
    except Exception as e:  # a crash mid-file is a failure, not a silent pass
        ns['FAILS'].append(f'{name} crashed: {type(e).__name__}: {e}')
        print('CRASH', name, repr(e))

print(f"\n{ns['PASSES'][0]} passed, {len(ns['FAILS'])} failed")
for f in ns['FAILS']:
    print('  -', f)
sys.exit(1 if ns['FAILS'] else 0)
