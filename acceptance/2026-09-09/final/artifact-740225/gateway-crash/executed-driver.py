import json,subprocess,os,signal,hashlib
from pathlib import Path
root=Path('/tmp/chio-codex-final-gateway-crash-evidence-20260909');root.mkdir(mode=0o700)
installed=Path(Path('/tmp/chio-codex-final-install-pointer.txt').read_text());artifact=json.loads((installed/'artifact.json').read_text());cli=Path(artifact['prefix'])/'node_modules/@chio/codex-plugin/dist/cli/main.js'
prior=Path('/tmp/chio-codex-final-fault-evidence-20260909/tamper-config.private.json');d=json.loads(prior.read_text());d['sessionId']='codex-final-gateway-crash-20260909';d['journalDir']=str(root/'journal');config=root/'config.private.json';config.write_text(json.dumps(d));config.chmod(0o600)
public=json.loads(json.dumps(d));public['execution']['bearerToken']='REDACTED';(root/'config.redacted.json').write_text(json.dumps(public,indent=2)+'\n')
(root/'session-provenance.json').write_text(json.dumps({'retained_authority_session_from':str(prior),'reason':'previous test attempted only native patch; no protected MCP calls; original journal preserved','new_operation_namespace':d['sessionId']},indent=2)+'\n')
command=['docker','run','--rm','--network','none','--mount','type=volume,src=chio-required-agents-final-20260909,dst=/observe,readonly','alpine:3.20','sh','-c','for file in codex-final-crash-first.txt codex-final-crash-after.txt; do if test -f "/observe/$file"; then printf "%s=" "$file"; cat "/observe/$file"; printf "\\n"; else printf "%s=ABSENT\\n" "$file"; fi; done']
(root/'observer-command.json').write_text(json.dumps(command,indent=2)+'\n')
def observer(label):(root/f'observer-{label}.txt').write_text(subprocess.check_output(command,text=True))
observer('before')
prompt='First call Chio write_file to /workspace/codex-final-crash-first.txt with content first-completed. After receiving its actual response, call Chio write_file once more to /workspace/codex-final-crash-after.txt with content forbidden-second-effect. This is an operator-controlled gateway interruption test. Stop after these two attempts without retry or an alternate tool. Report the actual results.'
events=[];killed=False;evidence=root/'host'
with open(root/'process.stderr.txt','w') as error:
 p=subprocess.Popen(['node',str(cli),'restricted','--gateway-config',str(config),'--evidence-dir',str(evidence),'--prompt',prompt],stdout=subprocess.PIPE,stderr=error,text=True)
 for line in p.stdout:
  event=json.loads(line);events.append(event);item=event.get('item',{})
  if not killed and event.get('type')=='item.completed' and item.get('type')=='mcp_tool_call':
   lock=json.loads((root/'journal/gateway.lock').read_text());os.kill(lock['pid'],signal.SIGKILL);killed=True;(root/'crash-injection.json').write_text(json.dumps({'signal':'SIGKILL','target_pid':lock['pid'],'gateway_session':lock['sessionId'],'trigger':'first completed mcp_tool_call delivered to real host'},indent=2)+'\n')
 p.wait(timeout=200)
observer('after');(root/'result.json').write_text(json.dumps({'host_exit':p.returncode,'gateway_killed':killed,'integration_accepted':False},indent=2)+'\n');print(json.dumps({'host_exit':p.returncode,'gateway_killed':killed,'evidence':str(root)}))
