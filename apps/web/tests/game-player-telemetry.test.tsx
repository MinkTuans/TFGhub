import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { GamePlayer } from "../components/game-player";
const props={title:"Tracked",src:"/api/play/tracked/",slug:"tracked",viewportWidth:16,viewportHeight:9};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
test("starts only after explicit launch and iframe load, keeps sandbox, deduplicates reload", async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({playId:"one",token:"test-capability",scoresEnabled:false})});vi.stubGlobal("fetch",fetcher);
 render(<GamePlayer {...props}/>);
 expect(screen.queryByTitle("Chơi Tracked")).not.toBeInTheDocument();expect(fetcher).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Bắt đầu chơi"}));
 const iframe=screen.getByTitle("Chơi Tracked");expect(iframe).toHaveAttribute("sandbox","allow-scripts allow-pointer-lock");expect(fetcher).not.toHaveBeenCalled();
 fireEvent.load(iframe);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
 fireEvent.load(iframe);expect(fetcher).toHaveBeenCalledTimes(1);
 expect(fetcher.mock.calls[0][0]).toMatch(/engagement\/games\/tracked\/plays$/);
});
test("telemetry failure never removes the playable iframe",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("offline")));
 render(<GamePlayer {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Bắt đầu chơi"}));
 const frame=screen.getByTitle("Chơi Tracked");await act(async()=>fireEvent.load(frame));
 expect(screen.getByTitle("Chơi Tracked")).toBe(frame);
});
test("untracked preview does not contact engagement API",()=>{
 const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
 render(<GamePlayer {...props} slug={undefined}/>);fireEvent.load(screen.getByTitle("Chơi Tracked"));expect(fetcher).not.toHaveBeenCalled();
});

test("records active intervals, excludes hidden time and accepts only its own frame score", async()=>{
 vi.useFakeTimers();
 let now=0, visible=true;
 vi.spyOn(performance,"now").mockImplementation(()=>now);
 vi.spyOn(document,"hasFocus").mockReturnValue(true);
 vi.spyOn(document,"visibilityState","get").mockImplementation(()=>visible?"visible":"hidden");
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({playId:"one",token:"test-capability",scoresEnabled:true})});vi.stubGlobal("fetch",fetcher);
 const {unmount}=render(<GamePlayer {...props}/>);
 try {
 fireEvent.click(screen.getByRole("button",{name:"Bắt đầu chơi"}));
 const iframe=screen.getByTitle("Chơi Tracked") as HTMLIFrameElement;
 await act(async()=>fireEvent.load(iframe));
 now=15000;await act(async()=>vi.advanceTimersByTime(15000));
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({sequence:1,activeSeconds:15});
 now=18000;visible=false;await act(async()=>fireEvent(document,new Event("visibilitychange")));
 expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({sequence:2,activeSeconds:3});
 now=60000;await act(async()=>vi.advanceTimersByTime(42000));expect(fetcher).toHaveBeenCalledTimes(3);
 visible=true;await act(async()=>fireEvent(document,new Event("visibilitychange")));
 fireEvent(window,new MessageEvent("message",{source:window,data:{type:"tfg:score",score:99}}));
 await act(async()=>vi.advanceTimersByTime(1000));expect(fetcher).toHaveBeenCalledTimes(3);
 fireEvent(window,new MessageEvent("message",{source:iframe.contentWindow,data:{type:"tfg:score",score:42}}));
 await act(async()=>vi.advanceTimersByTime(1000));expect(fetcher).toHaveBeenCalledTimes(4);
 expect(fetcher.mock.calls[3][0]).toMatch(/\/plays\/one\/score$/);expect(JSON.parse(fetcher.mock.calls[3][1].body).score).toBe(42);
 } finally {unmount();vi.useRealTimers();}
});

function deferred<T>() {
 let resolve!: (value:T)=>void;
 const promise=new Promise<T>(done=>{resolve=done;});
 return {promise,resolve};
}
const playSession={playId:"one",token:"test-capability",scoresEnabled:true,personalBest:70};
const response=(value:unknown)=>({ok:true,json:async()=>structuredClone(value)});
function launch() {
 fireEvent.click(screen.getByRole("button",{name:"Bắt đầu chơi"}));
 return screen.getByTitle("Chơi Tracked") as HTMLIFrameElement;
}
function send(frame:HTMLIFrameElement,data:unknown,source:Window|null=frame.contentWindow) {
 fireEvent(window,new MessageEvent("message",{source,data}));
}

test("hydrates a ready frame after delayed start and answers only that frame without exposing its capability",async()=>{
 const start=deferred<ReturnType<typeof response>>();
 vi.stubGlobal("fetch",vi.fn().mockReturnValue(start.promise));
 render(<GamePlayer {...props}/>);const frame=launch();
 const post=vi.spyOn(frame.contentWindow!,"postMessage");
 send(frame,{type:"tfg:score-ready"});
 fireEvent.load(frame);expect(post).not.toHaveBeenCalled();
 await act(async()=>start.resolve(response(playSession)));
 expect(post).toHaveBeenLastCalledWith({type:"tfg:score-state",personalBest:70},"*");
 post.mockClear();
 send(frame,{type:"tfg:score-ready"},window);
 send(frame,{type:"other"});send(frame,null);
 expect(post).not.toHaveBeenCalled();
 send(frame,{type:"tfg:score-ready"});
 expect(post).toHaveBeenCalledExactlyOnceWith({type:"tfg:score-state",personalBest:70},"*");
 post.mockClear();fireEvent.load(frame);
 expect(post).toHaveBeenCalledExactlyOnceWith({type:"tfg:score-state",personalBest:70},"*");
});

test("sends scores immediately, coalesces in-flight improvements and acknowledges the personal rather than global best",async()=>{
 const save=deferred<ReturnType<typeof response>>();
 const fetcher=vi.fn().mockResolvedValueOnce(response(playSession)).mockReturnValueOnce(save.promise)
  .mockResolvedValue(response({highScore:900,personalBest:90}));
 vi.stubGlobal("fetch",fetcher);
 render(<GamePlayer {...props}/>);const frame=launch();const post=vi.spyOn(frame.contentWindow!,"postMessage");
 await act(async()=>fireEvent.load(frame));post.mockClear();
 send(frame,{type:"tfg:score",score:80});
 expect(fetcher).toHaveBeenCalledTimes(2);
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({token:"test-capability",score:80});
 send(frame,{type:"tfg:score",score:90});send(frame,{type:"tfg:score",score:85});
 expect(fetcher).toHaveBeenCalledTimes(2);expect(post).not.toHaveBeenCalled();
 await act(async()=>save.resolve(response({highScore:900,personalBest:80})));
 expect(fetcher).toHaveBeenCalledTimes(3);
 expect(JSON.parse(fetcher.mock.calls[2][1].body).score).toBe(90);
 expect(post).toHaveBeenNthCalledWith(1,{type:"tfg:score-state",personalBest:80},"*");
 expect(post).toHaveBeenLastCalledWith({type:"tfg:score-state",personalBest:90},"*");
 await act(async()=>send(frame,{type:"tfg:score",score:90}));expect(fetcher).toHaveBeenCalledTimes(3);
});

test.each(["pagehide","unmount"])("flushes the newest unacknowledged score with keepalive on %s while an earlier save is pending",async(event)=>{
 const save=deferred<ReturnType<typeof response>>();
 const fetcher=vi.fn().mockResolvedValueOnce(response(playSession)).mockReturnValue(save.promise);vi.stubGlobal("fetch",fetcher);
 const {unmount}=render(<GamePlayer {...props}/>);const frame=launch();await act(async()=>fireEvent.load(frame));
 send(frame,{type:"tfg:score",score:80});send(frame,{type:"tfg:score",score:100});
 if(event==="pagehide") fireEvent(window,new Event("pagehide"));else unmount();
 const saves=fetcher.mock.calls.filter(([path])=>String(path).endsWith("/score"));
 expect(saves).toHaveLength(2);
 expect(saves[1][1].keepalive).toBe(true);
 expect(JSON.parse(saves[1][1].body).score).toBe(100);
});

test("does not lose scores reported before the load event and start response",async()=>{
 const start=deferred<ReturnType<typeof response>>();
 const fetcher=vi.fn().mockReturnValueOnce(start.promise).mockResolvedValue(response({highScore:900,personalBest:100}));vi.stubGlobal("fetch",fetcher);
 render(<GamePlayer {...props}/>);const frame=launch();
 send(frame,{type:"tfg:score",score:100});fireEvent.load(frame);
 await act(async()=>start.resolve(response(playSession)));
 expect(fetcher).toHaveBeenCalledTimes(2);
 expect(JSON.parse(fetcher.mock.calls[1][1].body).score).toBe(100);
});

test("retries a failed write and only acknowledges server-confirmed records",async()=>{
 vi.useFakeTimers();
 const fetcher=vi.fn().mockResolvedValueOnce(response(playSession)).mockRejectedValueOnce(new Error("offline"))
  .mockResolvedValue(response({highScore:900,personalBest:80}));vi.stubGlobal("fetch",fetcher);
 const {unmount}=render(<GamePlayer {...props}/>);
 try {
 const frame=launch();const post=vi.spyOn(frame.contentWindow!,"postMessage");
 await act(async()=>fireEvent.load(frame));post.mockClear();
 await act(async()=>send(frame,{type:"tfg:score",score:80}));
 expect(fetcher).toHaveBeenCalledTimes(2);expect(post).not.toHaveBeenCalled();
 await act(async()=>vi.advanceTimersByTime(1000));
 expect(JSON.parse(fetcher.mock.calls[2][1].body).score).toBe(80);
 expect(post).toHaveBeenLastCalledWith({type:"tfg:score-state",personalBest:80},"*");
 }finally {unmount();vi.useRealTimers();}
});

test("keeps the newest acknowledgement when unload save completes before an earlier request",async()=>{
 const earlier=deferred<ReturnType<typeof response>>(), later=deferred<ReturnType<typeof response>>();
 const fetcher=vi.fn().mockResolvedValueOnce(response(playSession)).mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
 vi.stubGlobal("fetch",fetcher);render(<GamePlayer {...props}/>);const frame=launch();
 const post=vi.spyOn(frame.contentWindow!,"postMessage");await act(async()=>fireEvent.load(frame));post.mockClear();
 send(frame,{type:"tfg:score",score:80});send(frame,{type:"tfg:score",score:100});fireEvent(window,new Event("pagehide"));
 await act(async()=>later.resolve(response({highScore:900,personalBest:100})));
 await act(async()=>earlier.resolve(response({highScore:900,personalBest:80})));
 expect(post.mock.calls.map(([message])=>message.personalBest)).toEqual([100,100]);
 expect(fetcher).toHaveBeenCalledTimes(3);
});

test.each([null,0])("hydrates %s without storing an account record in browser storage",async(personalBest)=>{
 const storage=vi.spyOn(Storage.prototype,"setItem");
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({...playSession,personalBest})));
 render(<GamePlayer {...props}/>);const frame=launch();const post=vi.spyOn(frame.contentWindow!,"postMessage");
 await act(async()=>fireEvent.load(frame));
 expect(post).toHaveBeenLastCalledWith({type:"tfg:score-state",personalBest},"*");expect(storage).not.toHaveBeenCalled();
});

test("returns an empty state and never saves when scoring is disabled",async()=>{
 const fetcher=vi.fn().mockResolvedValue(response({...playSession,scoresEnabled:false,personalBest:null}));vi.stubGlobal("fetch",fetcher);
 render(<GamePlayer {...props}/>);const frame=launch();const post=vi.spyOn(frame.contentWindow!,"postMessage");
 await act(async()=>fireEvent.load(frame));send(frame,{type:"tfg:score",score:500});fireEvent(window,new Event("pagehide"));
 expect(post).toHaveBeenLastCalledWith({type:"tfg:score-state",personalBest:null},"*");expect(fetcher).toHaveBeenCalledTimes(1);
});
