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
