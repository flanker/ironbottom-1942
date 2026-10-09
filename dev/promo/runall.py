"""Run recorder jobs in parallel: python3 dev/promo/runall.py <list.txt> [n=4]  (one job JSON per line; a .log beside each)"""
import os, sys, subprocess
from concurrent.futures import ThreadPoolExecutor
jobs = [l.strip() for l in open(sys.argv[1]) if l.strip()]
def go(j):
    with open(j + '.log', 'w') as f: r = subprocess.run(['python3', os.path.join(os.path.dirname(os.path.abspath(__file__)), '../record/record-duel.py'), j], stdout=f, stderr=subprocess.STDOUT)
    print('done', r.returncode, j.split('/')[-1], flush=True)
with ThreadPoolExecutor(int(sys.argv[2]) if len(sys.argv) > 2 else 4) as ex: list(ex.map(go, jobs))
