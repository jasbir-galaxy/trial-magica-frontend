// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import {cleanup,render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {IntegrationSettings} from "../src/components/integrations/integrations";
const {fetcher}=vi.hoisted(()=>({fetcher:vi.fn()}));
vi.mock("@clerk/nextjs",()=>({useAuth:()=>({getToken:async()=>"test-session"})}));
const id="00000000-0000-4000-8000-000000000001",secret="mgtrial_"+"x".repeat(43),stamp="2026-10-30T00:00:00.000Z";
const key={id,name:"Test key",prefix:"mgtrial_xxxxx",scopes:["chats:read"],createdAt:stamp,expiresAt:stamp,lastUsedAt:null};
function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});return {...render(<QueryClientProvider client={client}><IntegrationSettings userId="owner"/></QueryClientProvider>),client};}
beforeEach(()=>{fetcher.mockReset();vi.stubGlobal("fetch",fetcher);vi.stubEnv("NEXT_PUBLIC_API_BASE_URL","http://localhost:3001");});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();});
function defaults(url:URL|string){return Response.json(String(url).endsWith("webhooks")?{configured:true,items:[]}:{items:[]});}
it("keeps one-time credentials out of caches, hides them by default, and clears them on dismissal",async()=>{
 fetcher.mockImplementation(async(url,options)=>options.method==="POST"?Response.json({key,secret}):defaults(url));const {client,unmount}=mount();
 await screen.findByText("No active API keys.");await userEvent.type(screen.getByRole("textbox",{name:"Key name"}),"Test key");await userEvent.click(screen.getByRole("button",{name:"Create API key"}));
 const field=await screen.findByLabelText("API key",{exact:true});expect(field).toHaveAttribute("type","password");expect(field).toHaveFocus();
 expect(JSON.stringify(client.getQueryCache().getAll().map(q=>q.state.data))).not.toContain(secret);
 expect(JSON.stringify(client.getMutationCache().getAll().map(m=>m.state))).not.toContain(secret);
 await userEvent.click(screen.getByRole("button",{name:"Reveal secret"}));expect(field).toHaveAttribute("type","text");await userEvent.click(screen.getByRole("button",{name:"I saved it"}));expect(screen.queryByLabelText("API key",{exact:true})).not.toBeInTheDocument();unmount();
});
it("never automatically retries credential creation and reuses its request ID on explicit retry",async()=>{
 fetcher.mockImplementation(async(url,options)=>{if(options.method==="POST")throw new Error("Offline");return defaults(url);});mount();await screen.findByText("No active API keys.");await userEvent.type(screen.getByRole("textbox",{name:"Key name"}),"Test key");await userEvent.click(screen.getByRole("button",{name:"Create API key"}));
 await screen.findByRole("alert");const posts=()=>fetcher.mock.calls.filter(call=>call[1].method==="POST");expect(posts()).toHaveLength(1);await userEvent.click(screen.getByRole("button",{name:"Create API key"}));await waitFor(()=>expect(posts()).toHaveLength(2));expect(posts()[1][1].body).toBe(posts()[0][1].body);
});
it("validates webhook destinations and event selection before network submission",async()=>{
 fetcher.mockImplementation(async url=>defaults(url));mount();await screen.findByText("No active webhook endpoints.");await userEvent.type(screen.getByRole("textbox",{name:"Endpoint URL"}),"http://localhost");await userEvent.click(screen.getByRole("button",{name:"Create webhook"}));expect(await screen.findByRole("alert")).toHaveTextContent("public HTTPS URL");expect(fetcher.mock.calls.filter(call=>call[1].method==="POST")).toHaveLength(0);
});
it("aborts credential creation on navigation and never puts a late secret into cache",async()=>{
 let resolve!:(response:Response)=>void;fetcher.mockImplementation(async(url,options)=>options.method==="POST"?new Promise<Response>(r=>{resolve=r;}):defaults(url));const {client,unmount}=mount();await screen.findByText("No active API keys.");await userEvent.type(screen.getByRole("textbox",{name:"Key name"}),"Test key");await userEvent.click(screen.getByRole("button",{name:"Create API key"}));await waitFor(()=>expect(resolve).toBeDefined());const request=fetcher.mock.calls.find(call=>call[1].method==="POST")!;unmount();expect(request[1].signal.aborted).toBe(true);resolve(Response.json({key,secret}));await waitFor(()=>expect(client.getMutationCache().getAll()[0].state.status).not.toBe("pending"));expect(JSON.stringify(client.getMutationCache().getAll().map(m=>m.state))).not.toContain(secret);
});
it("reads persisted delivery outcomes and sends authenticated revocation",async()=>{
 let revoked=false;fetcher.mockImplementation(async(url,options)=>{const path=new URL(url).pathname;if(options.method==="DELETE"){revoked=true;expect(options.headers.get("Authorization")).toBe("Bearer test-session");return Response.json({success:true});}if(path.endsWith("deliveries"))return Response.json({items:[{id,eventId:id,type:"agent.completed",status:"failed",attempts:8,responseStatus:503,error:"Delivery attempts were exhausted.",createdAt:stamp,nextAttemptAt:stamp,deliveredAt:null}],hasMore:false,nextCursor:null});if(path.endsWith("webhooks"))return Response.json({configured:true,items:[{id,url:"https://example.com/events",events:["agent.completed"],createdAt:stamp}]});return Response.json({items:revoked?[]:[key]});});
 mount();await screen.findByText("Test key");await userEvent.click(screen.getByRole("button",{name:"Delivery history"}));expect(await screen.findByText("agent.completed · failed")).toBeVisible();expect(screen.getByText("8 attempts · HTTP 503")).toBeVisible();await userEvent.click(screen.getByRole("button",{name:"Revoke Test key"}));expect(await screen.findByText("No active API keys.")).toBeVisible();
});
