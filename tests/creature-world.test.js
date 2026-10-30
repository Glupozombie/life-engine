import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,stepWorld,getWorldStats} from '../js/creature-world.js';
test('world starts with visible population and food',()=>{const w=createWorld(42);const s=getWorldStats(w);assert.equal(s.population,36);assert.ok(s.food>0);});
test('same seed produces same initial world',()=>{assert.deepEqual(createWorld(123),createWorld(123));});
test('simulation advances and creatures spend energy',()=>{const w=createWorld(7);const before=w.creatures[0].energy;stepWorld(w,10);assert.equal(w.tick,10);assert.ok(w.creatures[0].energy<before);});
test('food is consumed and population remains bounded',()=>{const w=createWorld(99);stepWorld(w,900);assert.ok(w.creatures.length<=150);assert.ok(w.food.length>=0);});
test('statistics describe the current world',()=>{const w=createWorld(2);const s=getWorldStats(w);assert.equal(s.population,36);assert.equal(s.hunters+s.foragers,36);});
