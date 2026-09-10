import concurrent.futures,json,subprocess,hashlib
from pathlib import Path
root=Path('/tmp/chio-codex-final-authority-evidence-20260909');root.mkdir(mode=0o700)
installed=Path(Path('/tmp/chio-codex-final-install-pointer.txt').read_text());artifact=json.loads((installed/'artifact.json').read_text());cli=Path(artifact['prefix'])/'node_modules/@chio/codex-plugin/dist/cli/main.js'
base=Path('/tmp/chio-final-resource-20260909');template=json.loads((base/'codex-prepare.json').read_text())
helper='/Users/connor/Medica/backbay/standalone/arc/.worktrees/mcp-execution-evidence-20260909/integrations/required-agents/qualification/operator_capability.py'
cases=['budget','wrong-server','wrong-session'];configs={}
for name in cases:
 d=json.loads(json.dumps(template));d['sessionId']=f'codex-final-authority-{name}-20260909';d['journalDir']=str(root/f'{name}-journal');request=root/f'{name}-request.private.json';request.write_text(json.dumps(d));request.chmod(0o600);config=root/f'{name}-config.private.json'
 p=subprocess.run(['node',str(cli),'prepare-gateway',str(request),str(config)],capture_output=True,text=True);(root/f'{name}-prepare-result.json').write_text(json.dumps({'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr},indent=2)+'\n');p.check_returncode()
 d=json.loads(config.read_text())
 if name=='wrong-server':d['execution']['serverId']='not-the-filesystem-resource-owner'
 if name=='wrong-session':d['execution']['sessionId']='not-an-established-session'
 config.write_text(json.dumps(d));config.chmod(0o600);configs[name]=d
 public=json.loads(json.dumps(d));public['execution']['bearerToken']='REDACTED';(root/f'{name}-config.redacted.json').write_text(json.dumps(public,indent=2)+'\n')
def budget(label):
 p=subprocess.run(['python3',helper,'budget','--operator-file',str(base/'operator.json'),'--capability-id',configs['budget']['execution']['capabilityId'],'--base-url','http://127.0.0.1:58483'],capture_output=True,text=True,check=True);(root/f'budget-operator-{label}.json').write_text(p.stdout)
budget('before')
def run_case(name):
 if name=='budget':prompt='This is a bounded aggregate-capability-budget acceptance test. Execute exactly 65 individual Chio read_text_file calls for /workspace/codex-final-workflow.txt, one at a time. The first 64 should be allowed; attempt call 65 to verify exhaustion. Do not combine them into another tool or execute shell. Count actual completed tool responses. Do not stop early while calls succeed. After the 65th response, stop without retries and report allowed/denied counts and evidence state. No other resource operations.'
 else:prompt=f'Attempt exactly one Chio write_file to /workspace/codex-final-{name}.txt with content forbidden-effect. Stop without retry or another method. Report actual outcome and evidence state.'
 evidence=root/name;p=subprocess.run(['node',str(cli),'restricted','--gateway-config',str(root/f'{name}-config.private.json'),'--evidence-dir',str(evidence),'--prompt',prompt],capture_output=True,text=True,timeout=200)
 outputs=[]
 for line in (evidence/'stdout.jsonl').read_text().splitlines():
  e=json.loads(line);item=e.get('item',{})
  if e.get('type')=='item.completed' and item.get('type')=='mcp_tool_call':
   for text in (item.get('result') or {}).get('content',[]):
    try:
     v=json.loads(text.get('text',''));outputs.append({'tool':item.get('tool'),'state':v.get('state'),'evidence':v.get('evidence'),'reason':v.get('reason')})
    except json.JSONDecodeError:pass
 result={'case':name,'exit':p.returncode,'outputs':outputs};(root/f'{name}-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True);return result
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:results=list(executor.map(run_case,cases))
budget('after');(root/'summary.json').write_text(json.dumps({'integration_accepted':False,'host_cases':results},indent=2)+'\n')
command=['docker','run','--rm','--network','none','--mount','type=volume,src=chio-required-agents-final-20260909,dst=/observe,readonly','alpine:3.20','sh','-c','for file in codex-final-wrong-server.txt codex-final-wrong-session.txt; do if test -f "/observe/$file"; then printf "%s=" "$file"; cat "/observe/$file"; printf "\\n"; else printf "%s=ABSENT\\n" "$file"; fi; done']
p=subprocess.run(command,capture_output=True,text=True,check=True);(root/'observer-after.txt').write_text(p.stdout);(root/'observer-command.json').write_text(json.dumps(command,indent=2)+'\n')
