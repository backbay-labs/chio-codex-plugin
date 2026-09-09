from pathlib import Path
import json,subprocess,http.server,threading,os,hashlib
root=Path('/tmp/chio-codex-budget-dispatch2-evidence-20260909');root.mkdir(mode=0o700)
installed=Path(Path('/tmp/chio-codex-final-install-pointer.txt').read_text());artifact=json.loads((installed/'artifact.json').read_text());package=Path(artifact['prefix'])/'node_modules/@chio/codex-plugin';gateway=(package/'node_modules/@chio/bridge/dist/gateway.js').resolve()
prior=Path('/tmp/chio-codex-final-authority-evidence-20260909/budget-config.private.json');config=json.loads(prior.read_text());config['sessionId']='codex-budget-driver-continuation2-20260909';config['journalDir']=str(root/'journal');configpath=root/'config.private.json';configpath.write_text(json.dumps(config));configpath.chmod(0o600)
public=json.loads(json.dumps(config));public['execution']['bearerToken']='REDACTED';(root/'config.redacted.json').write_text(json.dumps(public,indent=2)+'\n')
(root/'provenance.json').write_text(json.dumps({'kind':'deterministic model-transport driver; actual Codex host and real kernel; not a live model','prior_authority_session':str(prior),'prior_invocations':29,'prior_outcomes':'29 completed, then one not_dispatched; original journal retained','artifact':artifact,'gateway_sha256':hashlib.sha256(gateway.read_bytes()).hexdigest()},indent=2)+'\n')
profile=root/'profile';workspace=root/'workspace';profile.mkdir();workspace.mkdir();results={};requests=0
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  global requests
  request=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))));requests+=1
  for item in request.get('input',[]):
   if item.get('type')=='function_call_output':results[item.get('call_id')]=item.get('output')
  if requests<=36:item={'type':'function_call','id':f'fc_budget_{requests}','call_id':f'call_budget_{requests}','name':'mcp__chio__read_text_file','arguments':json.dumps({'path':'/workspace/codex-final-workflow.txt'})}
  else:item={'type':'message','id':'msg_done','role':'assistant','content':[{'type':'output_text','text':'Bounded budget dispatcher finished.'}]}
  response={'id':f'resp_{requests}','object':'response','status':'completed','output':[item],'usage':{'input_tokens':1,'output_tokens':1,'total_tokens':2}}
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  for event in [{'type':'response.created','response':{'id':f'resp_{requests}','status':'in_progress','output':[]}},{'type':'response.output_item.done','output_index':0,'item':item},{'type':'response.completed','response':response}]:self.wfile.write(('data: '+json.dumps(event)+'\n\n').encode())
  self.wfile.flush()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
script='import{restrictedHostArgs}from '+json.dumps(str(package/'dist/cli/restricted.js'))+';console.log(JSON.stringify(restrictedHostArgs(process.argv[1],process.argv[2],process.argv[3],"Execute the designated bounded budget test.")));'
command=json.loads(subprocess.check_output(['node','--input-type=module','-e',script,str(workspace),str(gateway),str(configpath)],text=True));i=command.index('--');command[i:i]=['-c','model_provider="probe"','-c','model_providers.probe.name="probe"','-c',f'model_providers.probe.base_url="http://127.0.0.1:{server.server_port}"','-c','model_providers.probe.wire_api="responses"']
(root/'command.json').write_text(json.dumps(command,indent=2)+'\n');env={k:os.environ[k] for k in ['PATH','USER','LOGNAME','SHELL','LANG','TMPDIR'] if k in os.environ};env['CODEX_HOME']=str(profile)
try:p=subprocess.run(['codex',*command],env=env,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=150)
finally:server.shutdown()
(root/'stdout.jsonl').write_text(p.stdout);(root/'stderr.txt').write_text(p.stderr);(root/'tool-results.json').write_text(json.dumps(results,indent=2)+'\n');summary={'host_exit':p.returncode,'model_requests':requests,'tool_responses':len(results),'integration_accepted':False};(root/'result.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
