import { expect, test } from "vitest";
import { ActivePlayClock, readGameScore } from "../lib/play-telemetry";

test("counts visible active intervals and discards hidden gaps", () => {
  const clock = new ActivePlayClock();
  clock.resume(1000);
  expect(clock.take(16500)).toBe(15);
  expect(clock.pause(18000)).toBe(2);
  expect(clock.take(90000)).toBe(0);
  clock.resume(100000);
  expect(clock.take(105000)).toBe(5);
});
test("bounds delayed timers and never credits negative time", () => {
  const clock = new ActivePlayClock();
  clock.resume(1000);
  expect(clock.take(200000)).toBe(30);
  expect(clock.take(199000)).toBe(0);
});
test("does not restart an already active clock on repeated focus", () => {
  const clock = new ActivePlayClock();
  clock.resume(1000); clock.resume(5000);
  expect(clock.take(11000)).toBe(10);
});
test("accepts bounded integer scores only from the active sandbox frame", () => {
  const frame = {} as Window;
  const event = (source: unknown, data: unknown) => ({ source, data }) as MessageEvent;
  expect(readGameScore(event(frame, {type:"tfg:score",score:42}), frame)).toBe(42);
  for (const score of [-1,1.5,Infinity,NaN,2147483648,"4",null]) expect(readGameScore(event(frame,{type:"tfg:score",score}),frame)).toBeNull();
  expect(readGameScore(event({},{type:"tfg:score",score:4}),frame)).toBeNull();
  expect(readGameScore(event(frame,{type:"other",score:4}),frame)).toBeNull();
  expect(readGameScore(event(null,{type:"tfg:score",score:4}),null)).toBeNull();
});

test("creates UUIDs on deployed HTTP origins without crypto.randomUUID", async()=>{
 const {createPlayRequestId}=await import("../lib/play-telemetry");
 const source={getRandomValues:(bytes:Uint8Array)=>{bytes.fill(171);return bytes;}};
 expect(createPlayRequestId(source)).toBe("abababab-abab-4bab-abab-abababababab");
});
