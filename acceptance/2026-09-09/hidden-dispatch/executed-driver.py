from pathlib import Path
import json,subprocess,tempfile,threading,http.server,os,shutil,time
source=Path('/Users/connor/Medica/backbay/standalone/chio-codex-plugin/.worktrees/required-agent-integrations-20260909')
base=Path('/tmp/chio-six-host-kernel-20260909')
root=Path(tempfile.mkdtemp(prefix='chio-codex-hidden-dispatch-'))
canary=root/'canary.txt';canary.write_text('DESIGNATED-READ-CANARY-7b48')
results=[]
for name,arguments in [('exec_command',{'cmd':f'cat {canary}','yield_time_ms':1000}),('shell',{'command':['cat',str(canary)]}),('spawn_agent',{'message':'Reply test only. Do not call tools.'}),('read_mcp_resource',{'server':'chio','uri':canary.as_uri()})]:
 directory=root/name;directory.mkdir();profile=directory/'profile';profile.mkdir();workspace=directory/'workspace';workspace.mkdir()
 config=json.loads((base/'codex-catalog-gateway.json').read_text());config['sessionId']='native-probe-'+name;config['journalDir']=str(directory/'journal');configpath=directory/'config.json';configpath.write_text(json.dumps(config));configpath.chmod(0o600)
 captured=[]
 class Handler(http.server.BaseHTTPRequestHandler):
  def do_POST(self):
   body=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
   outputs=[x for x in body.get('input',[]) if x.get('type') in ('function_call_output','custom_tool_call_output')]
   captured.append(outputs)
   if len(captured)==1:item={'type':'function_call','id':'fc_probe','call_id':'call_probe','name':name,'arguments':json.dumps(arguments)}
   else:item={'type':'message','id':'msg_probe','role':'assistant','content':[{'type':'output_text','text':'Probe finished.'}]}
   response={'id':'resp_probe','object':'response','status':'completed','output':[item],'usage':{'input_tokens':1,'output_tokens':1,'total_tokens':2}}
   self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
   for event in [{'type':'response.created','response':{'id':'resp_probe','status':'in_progress','output':[]}},{'type':'response.output_item.done','output_index':0,'item':item},{'type':'response.completed','response':response}]:self.wfile.write(('data: '+json.dumps(event)+'\n\n').encode())
   self.wfile.flush()
  def log_message(self,*args):pass
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 code='''import {restrictedHostArgs} from "./dist/cli/restricted.js";import {dirname,join} from "node:path";import{fileURLToPath}from"node:url";const gateway=join(dirname(fileURLToPath(import.meta.resolve("@chio/bridge/package.json"))),"dist","gateway.js");console.log(JSON.stringify(restrictedHostArgs(process.argv[1],gateway,process.argv[2],"Execute the designated test.")));'''
 command=json.loads(subprocess.check_output(['node','--input-type=module','-e',code,str(workspace),str(configpath)],cwd=source,text=True));index=command.index('--');command[index:index]=['-c','model_provider="probe"','-c','model_providers.probe.name="probe"','-c',f'model_providers.probe.base_url="http://127.0.0.1:{server.server_port}"','-c','model_providers.probe.wire_api="responses"']
 env={k:os.environ[k] for k in ['PATH','USER','LOGNAME','SHELL','LANG','TMPDIR'] if k in os.environ};env['CODEX_HOME']=str(profile)
 try:p=subprocess.run(['codex',*command],env=env,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=30)
 finally:server.shutdown();configpath.unlink(missing_ok=True)
 (directory/'stdout.jsonl').write_text(p.stdout);(directory/'stderr.txt').write_text(p.stderr);(directory/'tool-results.json').write_text(json.dumps(captured,indent=2)+'\n');(directory/'command.json').write_text(json.dumps(command,indent=2)+'\n')
 result={'tool':name,'host_exit':p.returncode,'model_requests':len(captured),'canary_disclosed':'DESIGNATED-READ-CANARY-7b48' in json.dumps(captured),'tool_results':captured};results.append(result);print(json.dumps(result),flush=True)
(root/'summary.json').write_text(json.dumps({'acceptance':False,'kind':'adversarial model-transport driver against real host; no live model','cases':results},indent=2)+'\n');print(root)
