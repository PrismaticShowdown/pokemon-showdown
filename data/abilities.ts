import {MoveTarget} from "../sim/dex-moves";
import {toID} from "../sim/dex-data";
import {Condition} from "../sim/dex-conditions";
import {Side} from "../sim/side";
import {Pokemon} from "../sim/pokemon.js";

function isParentalBondBanned(move: ActiveMove, source: Pokemon): boolean {
	if (move.category === "Status") return true;
	if (move.multihit) return true;
	if (move.flags["noparentalbond"]) return true;
	//if (doesMoveCharge(source, move)) return true;
	if (move.flags["futuremove"]) return true;
	if (move.spreadHit) return true;
	if (move.isZ) return true;
	if (move.isMax) return true;
	return false;
}
/*

Ratings and how they work:

-1: Detrimental
	  An ability that severely harms the user.
	ex. Defeatist, Slow Start

 0: Useless
	  An ability with no overall benefit in a singles battle.
	ex. Color Change, Plus

 1: Ineffective
	  An ability that has minimal effect or is only useful in niche situations.
	ex. Light Metal, Suction Cups

 2: Useful
	  An ability that can be generally useful.
	ex. Flame Body, Overcoat

 3: Effective
	  An ability with a strong effect on the user or foe.
	ex. Chlorophyll, Sturdy

 4: Very useful
	  One of the more popular abilities. It requires minimal support to be effective.
	ex. Adaptability, Magic Bounce

 5: Essential
	  The sort of ability that defines metagames.
	ex. Imposter, Shadow Tag

*/

export const Abilities: import('../sim/dex-abilities').AbilityDataTable = {
	noability: {
		isNonstandard: "Past",
		flags: {},
		name: "No Ability",
		rating: 0.1,
		num: 0,
	},
	adaptability: {
		onModifySTAB(stab, source, target, move) {
			if (move.forceSTAB || source.hasType(move.type)) {
				if (stab === 2) {
					return 2.25;
				}
				return 2;
			}
		},
		flags: {},
		name: "Adaptability",
		rating: 4,
		num: 91,
	},
	aerilate: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status') && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Flying';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		flags: {},
		name: "Aerilate",
		rating: 4,
		num: 184,
	},
	aftermath: {
		onDamagingHitOrder: 1,
		onDamagingHit(damage, target, source, move) {
			if (!target.hp && this.checkMoveMakesContact(move, source, target, true)) {
				this.damage(source.baseMaxhp / 4, source, target);
			}
		},
		flags: {},
		name: "Aftermath",
		rating: 2,
		num: 106,
	},
	airlock: {
		onSwitchIn(pokemon) {
			// Air Lock does not activate when Skill Swapped or when Neutralizing Gas leaves the field
			this.add('-ability', pokemon, 'Air Lock');
			((this.effect as any).onStart as (p: Pokemon) => void).call(this, pokemon);
		},
		onStart(pokemon) {
			pokemon.abilityState.ending = false; // Clear the ending flag
			this.eachEvent('WeatherChange', this.effect);
		},
		onEnd(pokemon) {
			pokemon.abilityState.ending = true;
			this.eachEvent('WeatherChange', this.effect);
		},
		suppressWeather: true,
		flags: {},
		name: "Air Lock",
		rating: 1.5,
		num: 76,
	},
	analytic: {
		onBasePowerPriority: 21,
		onBasePower(basePower, pokemon) {
			let boosted = true;
			for (const target of this.getAllActive()) {
				if (target === pokemon) continue;
				if (this.queue.willMove(target)) {
					boosted = false;
					break;
				}
			}
			if (boosted) {
				this.debug('Analytic boost');
				return this.chainModify([5325, 4096]);
			}
		},
		flags: {},
		name: "Analytic",
		rating: 2.5,
		num: 148,
	},
	angerpoint: {
		onHit(target, source, move) {
			if (!target.hp) return;
			if (move?.effectType === 'Move' && target.getMoveHitData(move).crit) {
				this.boost({ atk: 12 }, target, target);
			}
		},
		flags: {},
		name: "Anger Point",
		rating: 1,
		num: 83,
	},
	angershell: {
		onDamage(damage, target, source, effect) {
			if (
				effect.effectType === "Move" &&
				!effect.multihit &&
				(!effect.negateSecondary && !(effect.hasSheerForce && source.hasAbility('sheerforce')))
			) {
				this.effectState.checkedAngerShell = false;
			} else {
				this.effectState.checkedAngerShell = true;
			}
		},
		onTryEatItem(item) {
			const healingItems = [
				'aguavberry', 'enigmaberry', 'figyberry', 'iapapaberry', 'magoberry', 'sitrusberry', 'wikiberry', 'oranberry', 'berryjuice',
			];
			if (healingItems.includes(item.id)) {
				return this.effectState.checkedAngerShell;
			}
			return true;
		},
		onAfterMoveSecondary(target, source, move) {
			this.effectState.checkedAngerShell = true;
			if (!source || source === target || !target.hp || !move.totalDamage) return;
			const lastAttackedBy = target.getLastAttackedBy();
			if (!lastAttackedBy) return;
			const damage = move.multihit ? move.totalDamage : lastAttackedBy.damage;
			if (target.hp <= target.maxhp / 2 && target.hp + damage > target.maxhp / 2) {
				this.boost({ atk: 1, spa: 1, spe: 1, def: -1, spd: -1 }, target, target);
			}
		},
		flags: {},
		name: "Anger Shell",
		rating: 3,
		num: 271,
	},
	anticipation: {
		onStart(pokemon) {
			for (const target of pokemon.foes()) {
				for (const moveSlot of target.moveSlots) {
					const move = this.dex.moves.get(moveSlot.move);
					if (move.category === 'Status') continue;
					const moveType = move.id === 'hiddenpower' ? target.hpType : move.type;
					if (
						this.dex.getImmunity(moveType, pokemon) && this.dex.getEffectiveness(moveType, pokemon) > 0 ||
						move.ohko
					) {
						this.add('-ability', pokemon, 'Anticipation');
						return;
					}
				}
			}
		},
		flags: {},
		name: "Anticipation",
		rating: 0.5,
		num: 107,
	},
	arenatrap: {
		onFoeTrapPokemon(pokemon) {
			if (!pokemon.isAdjacent(this.effectState.target)) return;
			if (pokemon.isGrounded()) {
				pokemon.tryTrap(true);
			}
		},
		onFoeMaybeTrapPokemon(pokemon, source) {
			if (!source) source = this.effectState.target;
			if (!source || !pokemon.isAdjacent(source)) return;
			if (pokemon.isGrounded(!pokemon.knownType)) { // Negate immunity if the type is unknown
				pokemon.maybeTrapped = true;
			}
		},
		flags: {},
		name: "Arena Trap",
		rating: 5,
		num: 71,
	},
	armortail: {
		onFoeTryMove(target, source, move) {
			const targetAllExceptions = ['perishsong', 'flowershield', 'rototiller'];
			if (move.target === 'foeSide' || (move.target === 'all' && !targetAllExceptions.includes(move.id))) {
				return;
			}

			const armorTailHolder = this.effectState.target;
			if ((source.isAlly(armorTailHolder) || move.target === 'all') && move.priority > 0.1) {
				this.attrLastMove('[still]');
				this.add('cant', armorTailHolder, 'ability: Armor Tail', move, `[of] ${target}`);
				return false;
			}
		},
		flags: { breakable: 1 },
		name: "Armor Tail",
		rating: 2.5,
		num: 296,
	},
	aromaveil: {
		onAllyTryAddVolatile(status, target, source, effect) {
			if (['attract', 'disable', 'encore', 'healblock', 'taunt', 'torment'].includes(status.id)) {
				if (effect.effectType === 'Move') {
					const effectHolder = this.effectState.target;
					this.add('-block', target, 'ability: Aroma Veil', `[of] ${effectHolder}`);
				}
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Aroma Veil",
		rating: 2,
		num: 165,
	},
	asoneglastrier: {
		onSwitchInPriority: 1,
		onStart(pokemon) {
			if (this.effectState.unnerved) return;
			this.add('-ability', pokemon, 'As One');
			this.add('-ability', pokemon, 'Unnerve');
			this.effectState.unnerved = true;
		},
		onEnd() {
			this.effectState.unnerved = false;
		},
		onFoeTryEatItem() {
			return !this.effectState.unnerved;
		},
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === 'Move') {
				this.boost({ atk: length }, source, source, this.dex.abilities.get('chillingneigh'));
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "As One (Glastrier)",
		rating: 3.5,
		num: 266,
	},
	asonespectrier: {
		onSwitchInPriority: 1,
		onStart(pokemon) {
			if (this.effectState.unnerved) return;
			this.add('-ability', pokemon, 'As One');
			this.add('-ability', pokemon, 'Unnerve');
			this.effectState.unnerved = true;
		},
		onEnd() {
			this.effectState.unnerved = false;
		},
		onFoeTryEatItem() {
			return !this.effectState.unnerved;
		},
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === 'Move') {
				this.boost({ spa: length }, source, source, this.dex.abilities.get('grimneigh'));
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "As One (Spectrier)",
		rating: 3.5,
		num: 267,
	},
	aurabreak: {
		onStart(pokemon) {
			this.add('-ability', pokemon, 'Aura Break');
		},
		onAnyTryPrimaryHit(target, source, move) {
			if (target === source || move.category === 'Status') return;
			move.hasAuraBreak = true;
		},
		flags: { breakable: 1 },
		name: "Aura Break",
		rating: 1,
		num: 188,
	},
	baddreams: {
		onResidualOrder: 28,
		onResidualSubOrder: 2,
		onResidual(pokemon) {
			if (!pokemon.hp) return;
			for (const target of pokemon.foes()) {
				if (target.status === 'slp' || target.hasAbility('comatose')) {
					this.damage(target.baseMaxhp / 8, target, pokemon);
				}
			}
		},
		flags: {},
		name: "Bad Dreams",
		rating: 1.5,
		num: 123,
	},
	ballfetch: {
		flags: {},
		name: "Ball Fetch",
		rating: 0,
		num: 237,
	},
	battery: {
		onAllyBasePowerPriority: 22,
		onAllyBasePower(basePower, attacker, defender, move) {
			if (attacker !== this.effectState.target && move.category === 'Special') {
				this.debug('Battery boost');
				return this.chainModify([5325, 4096]);
			}
		},
		flags: {},
		name: "Battery",
		rating: 0,
		num: 217,
	},
	battlearmor: {
		onCriticalHit: false,
		flags: { breakable: 1 },
		name: "Battle Armor",
		rating: 1,
		num: 4,
	},
	battlebond: {
		onSourceAfterFaint(length, target, source, effect) {
			if (source.bondTriggered) return;
			if (effect?.effectType !== 'Move') return;
			if (source.species.id === 'greninjabond' && source.hp && !source.transformed && source.side.foePokemonLeft()) {
				this.boost({ atk: 1, spa: 1, spe: 1 }, source, source, this.effect);
				this.add('-activate', source, 'ability: Battle Bond');
				source.bondTriggered = true;
			}
		},
		onModifyMovePriority: -1,
		onModifyMove(move, attacker) {
			if (move.id === 'watershuriken' && attacker.species.name === 'Greninja-Ash' &&
				!attacker.transformed) {
				move.multihit = 3;
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Battle Bond",
		rating: 3.5,
		num: 210,
	},
	beadsofruin: {
		onStart(pokemon) {
			if (this.suppressingAbility(pokemon)) return;
			this.add('-ability', pokemon, 'Beads of Ruin');
		},
		onAnyModifySpD(spd, target, source, move) {
			const abilityHolder = this.effectState.target;
			if (target.hasAbility('Beads of Ruin')) return;
			if (!move.ruinedSpD?.hasAbility('Beads of Ruin')) move.ruinedSpD = abilityHolder;
			if (move.ruinedSpD !== abilityHolder) return;
			this.debug('Beads of Ruin SpD drop');
			return this.chainModify(0.75);
		},
		flags: {},
		name: "Beads of Ruin",
		rating: 4.5,
		num: 284,
	},
	beastboost: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === 'Move') {
				const bestStat = source.getBestStat(true, true);
				this.boost({ [bestStat]: length }, source);
			}
		},
		flags: {},
		name: "Beast Boost",
		rating: 3.5,
		num: 224,
	},
	berserk: {
		onDamage(damage, target, source, effect) {
			if (
				effect.effectType === "Move" &&
				!effect.multihit &&
				(!effect.negateSecondary && !(effect.hasSheerForce && source.hasAbility('sheerforce')))
			) {
				this.effectState.checkedBerserk = false;
			} else {
				this.effectState.checkedBerserk = true;
			}
		},
		onTryEatItem(item) {
			const healingItems = [
				'aguavberry', 'enigmaberry', 'figyberry', 'iapapaberry', 'magoberry', 'sitrusberry', 'wikiberry', 'oranberry', 'berryjuice',
			];
			if (healingItems.includes(item.id)) {
				return this.effectState.checkedBerserk;
			}
			return true;
		},
		onAfterMoveSecondary(target, source, move) {
			this.effectState.checkedBerserk = true;
			if (!source || source === target || !target.hp || !move.totalDamage) return;
			const lastAttackedBy = target.getLastAttackedBy();
			if (!lastAttackedBy) return;
			const damage = move.multihit && !move.smartTarget ? move.totalDamage : lastAttackedBy.damage;
			if (target.hp <= target.maxhp / 2 && target.hp + damage > target.maxhp / 2) {
				this.boost({ spa: 1 }, target, target);
			}
		},
		flags: {},
		name: "Berserk",
		rating: 2,
		num: 201,
	},
	bigpecks: {
		onTryBoost(boost, target, source, effect) {
			if (source && target === source) return;
			if (boost.def && boost.def < 0) {
				delete boost.def;
				if (!(effect as ActiveMove).secondaries && effect.id !== 'octolock') {
					this.add("-fail", target, "unboost", "Defense", "[from] ability: Big Pecks", `[of] ${target}`);
				}
			}
		},
		flags: { breakable: 1 },
		name: "Big Pecks",
		rating: 0.5,
		num: 145,
	},
	blaze: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Fire' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Blaze boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Fire' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Blaze boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Blaze",
		rating: 2,
		num: 66,
	},
	bulletproof: {
		onTryHit(pokemon, target, move) {
			if (move.flags['bullet']) {
				this.add('-immune', pokemon, '[from] ability: Bulletproof');
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Bulletproof",
		rating: 3,
		num: 171,
	},
	cheekpouch: {
		onEatItem(item, pokemon) {
			this.heal(pokemon.baseMaxhp / 3);
		},
		flags: {},
		name: "Cheek Pouch",
		rating: 2,
		num: 167,
	},
	chillingneigh: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === 'Move') {
				this.boost({ atk: length }, source);
			}
		},
		flags: {},
		name: "Chilling Neigh",
		rating: 3,
		num: 264,
	},
	chlorophyll: {
		onModifySpe(spe, pokemon) {
			if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(2);
			}
		},
		flags: {},
		name: "Chlorophyll",
		rating: 3,
		num: 34,
	},
	clearbody: {
		onTryBoost(boost, target, source, effect) {
			if (source && target === source) return;
			let showMsg = false;
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! < 0) {
					delete boost[i];
					showMsg = true;
				}
			}
			if (showMsg && !(effect as ActiveMove).secondaries && effect.id !== 'octolock') {
				this.add("-fail", target, "unboost", "[from] ability: Clear Body", `[of] ${target}`);
			}
		},
		flags: { breakable: 1 },
		name: "Clear Body",
		rating: 2,
		num: 29,
	},
	cloudnine: {
		onSwitchIn(pokemon) {
			// Cloud Nine does not activate when Skill Swapped or when Neutralizing Gas leaves the field
			this.add('-ability', pokemon, 'Cloud Nine');
			((this.effect as any).onStart as (p: Pokemon) => void).call(this, pokemon);
		},
		onStart(pokemon) {
			pokemon.abilityState.ending = false; // Clear the ending flag
			this.eachEvent('WeatherChange', this.effect);
		},
		onEnd(pokemon) {
			pokemon.abilityState.ending = true;
			this.eachEvent('WeatherChange', this.effect);
		},
		suppressWeather: true,
		flags: {},
		name: "Cloud Nine",
		rating: 1.5,
		num: 13,
	},
	colorchange: {
		onAfterMoveSecondary(target, source, move) {
			if (!target.hp) return;
			const type = move.type;
			if (
				target.isActive && move.effectType === 'Move' && move.category !== 'Status' &&
				type !== '???' && !target.hasType(type)
			) {
				if (!target.setType(type)) return false;
				this.add('-start', target, 'typechange', type, '[from] ability: Color Change');

				if (target.side.active.length === 2 && target.position === 1) {
					// Curse Glitch
					const action = this.queue.willMove(target);
					if (action && action.move.id === 'curse') {
						action.targetLoc = -1;
					}
				}
			}
		},
		flags: {},
		name: "Color Change",
		rating: 0,
		num: 16,
	},
	comatose: {
		onStart(pokemon) {
			this.add('-ability', pokemon, 'Comatose');
		},
		onSetStatus(status, target, source, effect) {
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Comatose');
			}
			return false;
		},
		// Permanent sleep "status" implemented in the relevant sleep-checking effects
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Comatose",
		rating: 4,
		num: 213,
	},
	commander: {
		onAnySwitchInPriority: -2,
		onAnySwitchIn() {
			((this.effect as any).onUpdate as (p: Pokemon) => void).call(this, this.effectState.target);
		},
		onStart(pokemon) {
			((this.effect as any).onUpdate as (p: Pokemon) => void).call(this, pokemon);
		},
		onUpdate(pokemon) {
			if (this.gameType !== 'doubles') return;
			// don't run between when a Pokemon switches in and the resulting onSwitchIn event
			if (this.queue.peek()?.choice === 'runSwitch') return;

			const ally = pokemon.allies()[0];
			if (pokemon.switchFlag || ally?.switchFlag) return;
			if (!ally || pokemon.baseSpecies.baseSpecies !== 'Tatsugiri' || ally.baseSpecies.baseSpecies !== 'Dondozo') {
				// Handle any edge cases
				if (pokemon.getVolatile('commanding')) pokemon.removeVolatile('commanding');
				return;
			}

			if (!pokemon.getVolatile('commanding')) {
				// If Dondozo already was commanded this fails
				if (ally.getVolatile('commanded')) return;
				// Cancel all actions this turn for pokemon if applicable
				this.queue.cancelAction(pokemon);
				// Add volatiles to both pokemon
				this.add('-activate', pokemon, 'ability: Commander', `[of] ${ally}`);
				pokemon.addVolatile('commanding');
				ally.addVolatile('commanded', pokemon);
				// Continued in conditions.ts in the volatiles
			} else {
				if (!ally.fainted) return;
				pokemon.removeVolatile('commanding');
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1 },
		name: "Commander",
		rating: 0,
		num: 279,
	},
	competitive: {
		onAfterEachBoost(boost, target, source, effect) {
			if (!source || target.isAlly(source)) {
				return;
			}
			let statsLowered = false;
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! < 0) {
					statsLowered = true;
				}
			}
			if (statsLowered) {
				this.boost({ spa: 2 }, target, target, null, false, true);
			}
		},
		flags: {},
		name: "Competitive",
		rating: 2.5,
		num: 172,
	},
	compoundeyes: {
		onSourceModifyAccuracyPriority: -1,
		onSourceModifyAccuracy(accuracy) {
			if (typeof accuracy !== 'number') return;
			this.debug('compoundeyes - enhancing accuracy');
			return this.chainModify([5325, 4096]);
		},
		flags: {},
		name: "Compound Eyes",
		rating: 3,
		num: 14,
	},
	contrary: {
		onChangeBoost(boost, target, source, effect) {
			if (effect && effect.id === 'zpower') return;
			let i: BoostID;
			for (i in boost) {
				boost[i]! *= -1;
			}
		},
		flags: { breakable: 1 },
		name: "Contrary",
		rating: 4.5,
		num: 126,
	},
	corrosion: {
		// Implemented in sim/pokemon.js:Pokemon#setStatus
		flags: {},
		name: "Corrosion",
		rating: 2.5,
		num: 212,
	},
	costar: {
		onSwitchInPriority: -2,
		onStart(pokemon) {
			const ally = pokemon.allies()[0];
			if (!ally) return;

			let i: BoostID;
			for (i in ally.boosts) {
				pokemon.boosts[i] = ally.boosts[i];
			}
			const volatilesToCopy = ['dragoncheer', 'focusenergy', 'gmaxchistrike', 'laserfocus'];
			// we need to be sure to remove all the overlapping crit volatiles before trying to add any
			for (const volatile of volatilesToCopy) pokemon.removeVolatile(volatile);
			for (const volatile of volatilesToCopy) {
				if (ally.volatiles[volatile]) {
					pokemon.addVolatile(volatile);
					if (volatile === 'gmaxchistrike') pokemon.volatiles[volatile].layers = ally.volatiles[volatile].layers;
					if (volatile === 'dragoncheer') pokemon.volatiles[volatile].hasDragonType = ally.volatiles[volatile].hasDragonType;
				}
			}
			this.add('-copyboost', pokemon, ally, '[from] ability: Costar');
		},
		flags: {},
		name: "Costar",
		rating: 0,
		num: 294,
	},
	cottondown: {
		onDamagingHit(damage, target, source, move) {
			let activated = false;
			for (const pokemon of this.getAllActive()) {
				if (pokemon === target || pokemon.fainted) continue;
				if (!activated) {
					this.add('-ability', target, 'Cotton Down');
					activated = true;
				}
				this.boost({ spe: -1 }, pokemon, target, null, true);
			}
		},
		flags: {},
		name: "Cotton Down",
		rating: 2,
		num: 238,
	},
	cudchew: {
		onEatItem(item, pokemon) {
			if (item.isBerry && pokemon.addVolatile('cudchew')) {
				pokemon.volatiles['cudchew'].berry = item;
			}
		},
		onEnd(pokemon) {
			delete pokemon.volatiles['cudchew'];
		},
		condition: {
			noCopy: true,
			duration: 2,
			onRestart() {
				this.effectState.duration = 2;
			},
			onResidualOrder: 28,
			onResidualSubOrder: 2,
			onEnd(pokemon) {
				if (pokemon.hp) {
					const item = this.effectState.berry;
					this.add('-activate', pokemon, 'ability: Cud Chew');
					this.add('-enditem', pokemon, item.name, '[eat]');
					if (this.singleEvent('Eat', item, null, pokemon, null, null)) {
						this.runEvent('EatItem', pokemon, null, null, item);
					}
					if (item.onEat) pokemon.ateBerry = true;
				}
			},
		},
		flags: {},
		name: "Cud Chew",
		rating: 2,
		num: 291,
	},
	curiousmedicine: {
		onStart(pokemon) {
			for (const ally of pokemon.adjacentAllies()) {
				ally.clearBoosts();
				this.add('-clearboost', ally, '[from] ability: Curious Medicine', `[of] ${pokemon}`);
			}
		},
		flags: {},
		name: "Curious Medicine",
		rating: 0,
		num: 261,
	},
	cursedbody: {
		onDamagingHit(damage, target, source, move) {
			if (source.volatiles['disable']) return;
			if (!move.isMax && !move.flags['futuremove'] && move.id !== 'struggle') {
				if (this.randomChance(3, 10)) {
					source.addVolatile('disable', this.effectState.target);
				}
			}
		},
		flags: {},
		name: "Cursed Body",
		rating: 2,
		num: 130,
	},
	cutecharm: {
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target)) {
				if (this.randomChance(3, 10)) {
					source.addVolatile('attract', this.effectState.target);
				}
			}
		},
		flags: {},
		name: "Cute Charm",
		rating: 0.5,
		num: 56,
	},
	damp: {
		onAnyTryMove(target, source, effect) {
			if (['explosion', 'mindblown', 'mistyexplosion', 'selfdestruct'].includes(effect.id)) {
				this.attrLastMove('[still]');
				this.add('cant', this.effectState.target, 'ability: Damp', effect, `[of] ${target}`);
				return false;
			}
		},
		onAnyDamage(damage, target, source, effect) {
			if (effect && effect.name === 'Aftermath') {
				return false;
			}
		},
		flags: { breakable: 1 },
		name: "Damp",
		rating: 0.5,
		num: 6,
	},
	dancer: {
		flags: {},
		name: "Dancer",
		// implemented in runMove in scripts.js
		rating: 1.5,
		num: 216,
	},
	darkaura: {
		onStart(pokemon) {
			if (this.suppressingAbility(pokemon)) return;
			this.add('-ability', pokemon, 'Dark Aura');
		},
		onAnyBasePowerPriority: 20,
		onAnyBasePower(basePower, source, target, move) {
			if (target === source || move.category === 'Status' || move.type !== 'Dark') return;
			if (!move.auraBooster?.hasAbility('Dark Aura')) move.auraBooster = this.effectState.target;
			if (move.auraBooster !== this.effectState.target) return;
			return this.chainModify([move.hasAuraBreak ? 3072 : 5448, 4096]);
		},
		flags: {},
		name: "Dark Aura",
		rating: 3,
		num: 186,
	},
	dauntlessshield: {
		onStart(pokemon) {
			if (pokemon.shieldBoost) return;
			pokemon.shieldBoost = true;
			this.boost({ def: 1 }, pokemon);
		},
		flags: {},
		name: "Dauntless Shield",
		rating: 3.5,
		num: 235,
	},
	dazzling: {
		onFoeTryMove(target, source, move) {
			const targetAllExceptions = ['perishsong', 'flowershield', 'rototiller'];
			if (move.target === 'foeSide' || (move.target === 'all' && !targetAllExceptions.includes(move.id))) {
				return;
			}

			const dazzlingHolder = this.effectState.target;
			if ((source.isAlly(dazzlingHolder) || move.target === 'all') && move.priority > 0.1) {
				this.attrLastMove('[still]');
				this.add('cant', dazzlingHolder, 'ability: Dazzling', move, `[of] ${target}`);
				return false;
			}
		},
		flags: { breakable: 1 },
		name: "Dazzling",
		rating: 2.5,
		num: 219,
	},
	defeatist: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, pokemon) {
			if (pokemon.hp <= pokemon.maxhp / 2) {
				return this.chainModify(0.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, pokemon) {
			if (pokemon.hp <= pokemon.maxhp / 2) {
				return this.chainModify(0.5);
			}
		},
		flags: {},
		name: "Defeatist",
		rating: -1,
		num: 129,
	},
	defiant: {
		onAfterEachBoost(boost, target, source, effect) {
			if (!source || target.isAlly(source)) {
				return;
			}
			let statsLowered = false;
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! < 0) {
					statsLowered = true;
				}
			}
			if (statsLowered) {
				this.boost({ atk: 2 }, target, target, null, false, true);
			}
		},
		flags: {},
		name: "Defiant",
		rating: 3,
		num: 128,
	},
	deltastream: {
		onStart(source) {
			this.field.setWeather('deltastream');
		},
		onAnySetWeather(target, source, weather) {
			const strongWeathers = ['desolateland', 'primordialsea', 'deltastream'];
			if (this.field.getWeather().id === 'deltastream' && !strongWeathers.includes(weather.id)) return false;
		},
		onEnd(pokemon) {
			if (this.field.weatherState.source !== pokemon) return;
			for (const target of this.getAllActive()) {
				if (target === pokemon) continue;
				if (target.hasAbility('deltastream')) {
					this.field.weatherState.source = target;
					return;
				}
			}
			this.field.clearWeather();
		},
		flags: {},
		name: "Delta Stream",
		rating: 4,
		num: 191,
	},
	desolateland: {
		onStart(source) {
			this.field.setWeather('desolateland');
		},
		onAnySetWeather(target, source, weather) {
			const strongWeathers = ['desolateland', 'primordialsea', 'deltastream'];
			if (this.field.getWeather().id === 'desolateland' && !strongWeathers.includes(weather.id)) return false;
		},
		onEnd(pokemon) {
			if (this.field.weatherState.source !== pokemon) return;
			for (const target of this.getAllActive()) {
				if (target === pokemon) continue;
				if (target.hasAbility('desolateland')) {
					this.field.weatherState.source = target;
					return;
				}
			}
			this.field.clearWeather();
		},
		flags: {},
		name: "Desolate Land",
		rating: 4.5,
		num: 190,
	},
	disguise: {
		onDamagePriority: 1,
		onDamage(damage, target, source, effect) {
			if (effect?.effectType === 'Move' && ['mimikyu', 'mimikyutotem'].includes(target.species.id)) {
				this.add('-activate', target, 'ability: Disguise');
				this.effectState.busted = true;
				return 0;
			}
		},
		onCriticalHit(target, source, move) {
			if (!target) return;
			if (!['mimikyu', 'mimikyutotem'].includes(target.species.id)) {
				return;
			}
			const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
			if (hitSub) return;

			if (!target.runImmunity(move)) return;
			return false;
		},
		onEffectiveness(typeMod, target, type, move) {
			if (!target || move.category === 'Status') return;
			if (!['mimikyu', 'mimikyutotem'].includes(target.species.id)) {
				return;
			}

			const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
			if (hitSub) return;

			if (!target.runImmunity(move)) return;
			return 0;
		},
		onUpdate(pokemon) {
			if (['mimikyu', 'mimikyutotem'].includes(pokemon.species.id) && this.effectState.busted) {
				const speciesid = pokemon.species.id === 'mimikyutotem' ? 'Mimikyu-Busted-Totem' : 'Mimikyu-Busted';
				pokemon.formeChange(speciesid, this.effect, true);
				this.damage(pokemon.baseMaxhp / 8, pokemon, pokemon, this.dex.species.get(speciesid));
			}
		},
		flags: {
			failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1,
			breakable: 1, notransform: 1,
		},
		name: "Disguise",
		rating: 3.5,
		num: 209,
	},
	download: {
		onStart(pokemon) {
			let totaldef = 0;
			let totalspd = 0;
			for (const target of pokemon.foes()) {
				totaldef += target.getStat('def', false, true);
				totalspd += target.getStat('spd', false, true);
			}
			if (totaldef && totaldef >= totalspd) {
				this.boost({ spa: 1 });
			} else if (totalspd) {
				this.boost({ atk: 1 });
			}
		},
		flags: {},
		name: "Download",
		rating: 3.5,
		num: 88,
	},
	dragonsmaw: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Dragon') {
				this.debug('Dragon\'s Maw boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Dragon') {
				this.debug('Dragon\'s Maw boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Dragon's Maw",
		rating: 3.5,
		num: 263,
	},
	drizzle: {
		onStart(source) {
			if (source.species.id === 'kyogre' && source.item === 'blueorb') return;
			this.field.setWeather('raindance');
		},
		flags: {},
		name: "Drizzle",
		rating: 4,
		num: 2,
	},
	drought: {
		onStart(source) {
			if (source.species.id === 'groudon' && source.item === 'redorb') return;
			this.field.setWeather('sunnyday');
		},
		flags: {},
		name: "Drought",
		rating: 4,
		num: 70,
	},
	dryskin: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Water') {
				if (!this.heal(target.baseMaxhp / 4)) {
					this.add('-immune', target, '[from] ability: Dry Skin');
				}
				return null;
			}
		},
		onSourceBasePowerPriority: 17,
		onSourceBasePower(basePower, attacker, defender, move) {
			if (move.type === 'Fire') {
				return this.chainModify(1.25);
			}
		},
		onWeather(target, source, effect) {
			if (target.hasItem('utilityumbrella')) return;
			if (effect.id === 'raindance' || effect.id === 'primordialsea') {
				this.heal(target.baseMaxhp / 8);
			} else if (effect.id === 'sunnyday' || effect.id === 'desolateland') {
				this.damage(target.baseMaxhp / 8, target, target);
			}
		},
		flags: { breakable: 1 },
		name: "Dry Skin",
		rating: 3,
		num: 87,
	},
	earlybird: {
		flags: {},
		name: "Early Bird",
		// Implemented in statuses.js
		rating: 1.5,
		num: 48,
	},
	eartheater: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Ground') {
				if (!this.heal(target.baseMaxhp / 4)) {
					this.add('-immune', target, '[from] ability: Earth Eater');
				}
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Earth Eater",
		rating: 3.5,
		num: 297,
	},
	effectspore: {
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target) && !source.status && source.runStatusImmunity('powder')) {
				const r = this.random(100);
				if (r < 11) {
					source.setStatus('slp', target);
				} else if (r < 21) {
					source.setStatus('par', target);
				} else if (r < 30) {
					source.setStatus('psn', target);
				}
			}
		},
		flags: {},
		name: "Effect Spore",
		rating: 2,
		num: 27,
	},
	electricsurge: {
		onStart(source) {
			this.field.setTerrain('electricterrain');
		},
		flags: {},
		name: "Electric Surge",
		rating: 4,
		num: 226,
	},
	electromorphosis: {
		onDamagingHitOrder: 1,
		onDamagingHit(damage, target, source, move) {
			target.addVolatile('charge');
		},
		flags: {},
		name: "Electromorphosis",
		rating: 3,
		num: 280,
	},
	embodyaspectcornerstone: {
		onStart(pokemon) {
			if (pokemon.baseSpecies.name === 'Ogerpon-Cornerstone-Tera' && pokemon.terastallized &&
				this.effectState.embodied !== pokemon.previouslySwitchedIn) {
				this.effectState.embodied = pokemon.previouslySwitchedIn;
				this.boost({ def: 1 }, pokemon);
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, notransform: 1 },
		name: "Embody Aspect (Cornerstone)",
		rating: 3.5,
		num: 304,
	},
	embodyaspecthearthflame: {
		onStart(pokemon) {
			if (pokemon.baseSpecies.name === 'Ogerpon-Hearthflame-Tera' && pokemon.terastallized &&
				this.effectState.embodied !== pokemon.previouslySwitchedIn) {
				this.effectState.embodied = pokemon.previouslySwitchedIn;
				this.boost({ atk: 1 }, pokemon);
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, notransform: 1 },
		name: "Embody Aspect (Hearthflame)",
		rating: 3.5,
		num: 303,
	},
	embodyaspectteal: {
		onStart(pokemon) {
			if (pokemon.baseSpecies.name === 'Ogerpon-Teal-Tera' && pokemon.terastallized &&
				this.effectState.embodied !== pokemon.previouslySwitchedIn) {
				this.effectState.embodied = pokemon.previouslySwitchedIn;
				this.boost({ spe: 1 }, pokemon);
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, notransform: 1 },
		name: "Embody Aspect (Teal)",
		rating: 3.5,
		num: 301,
	},
	embodyaspectwellspring: {
		onStart(pokemon) {
			if (pokemon.baseSpecies.name === 'Ogerpon-Wellspring-Tera' && pokemon.terastallized &&
				this.effectState.embodied !== pokemon.previouslySwitchedIn) {
				this.effectState.embodied = pokemon.previouslySwitchedIn;
				this.boost({ spd: 1 }, pokemon);
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, notransform: 1 },
		name: "Embody Aspect (Wellspring)",
		rating: 3.5,
		num: 302,
	},
	emergencyexit: {
		onEmergencyExit(target) {
			if (!this.canSwitch(target.side) || target.forceSwitchFlag || target.switchFlag) return;
			for (const side of this.sides) {
				for (const active of side.active) {
					active.switchFlag = false;
				}
			}
			target.switchFlag = true;
			this.add('-activate', target, 'ability: Emergency Exit');
		},
		flags: {},
		name: "Emergency Exit",
		rating: 1,
		num: 194,
	},
	fairyaura: {
		onStart(pokemon) {
			if (this.suppressingAbility(pokemon)) return;
			this.add('-ability', pokemon, 'Fairy Aura');
		},
		onAnyBasePowerPriority: 20,
		onAnyBasePower(basePower, source, target, move) {
			if (target === source || move.category === 'Status' || move.type !== 'Fairy') return;
			if (!move.auraBooster?.hasAbility('Fairy Aura')) move.auraBooster = this.effectState.target;
			if (move.auraBooster !== this.effectState.target) return;
			return this.chainModify([move.hasAuraBreak ? 3072 : 5448, 4096]);
		},
		flags: {},
		name: "Fairy Aura",
		rating: 3,
		num: 187,
	},
	filter: {
		onSourceModifyDamage(damage, source, target, move) {
			if (target.getMoveHitData(move).typeMod > 0) {
				this.debug('Filter neutralize');
				return this.chainModify(0.75);
			}
		},
		flags: { breakable: 1 },
		name: "Filter",
		rating: 3,
		num: 111,
	},
	flamebody: {
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target)) {
				if (this.randomChance(3, 10)) {
					source.trySetStatus('brn', target);
				}
			}
		},
		flags: {},
		name: "Flame Body",
		rating: 2,
		num: 49,
	},
	flareboost: {
		onBasePowerPriority: 19,
		onBasePower(basePower, attacker, defender, move) {
			if (attacker.status === 'brn' && move.category === 'Special') {
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Flare Boost",
		rating: 2,
		num: 138,
	},
	flashfire: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Fire') {
				move.accuracy = true;
				if (!target.addVolatile('flashfire')) {
					this.add('-immune', target, '[from] ability: Flash Fire');
				}
				return null;
			}
		},
		onEnd(pokemon) {
			pokemon.removeVolatile('flashfire');
		},
		condition: {
			noCopy: true, // doesn't get copied by Baton Pass
			onStart(target) {
				this.add('-start', target, 'ability: Flash Fire');
			},
			onModifyAtkPriority: 5,
			onModifyAtk(atk, attacker, defender, move) {
				if (move.type === 'Fire' && attacker.hasAbility('flashfire')) {
					this.debug('Flash Fire boost');
					return this.chainModify(1.5);
				}
			},
			onModifySpAPriority: 5,
			onModifySpA(atk, attacker, defender, move) {
				if (move.type === 'Fire' && attacker.hasAbility('flashfire')) {
					this.debug('Flash Fire boost');
					return this.chainModify(1.5);
				}
			},
			onEnd(target) {
				this.add('-end', target, 'ability: Flash Fire', '[silent]');
			},
		},
		flags: { breakable: 1 },
		name: "Flash Fire",
		rating: 3.5,
		num: 18,
	},
	flowergift: {
		onSwitchInPriority: -2,
		onStart(pokemon) {
			this.singleEvent('WeatherChange', this.effect, this.effectState, pokemon);
		},
		onWeatherChange(pokemon) {
			if (!pokemon.isActive || pokemon.baseSpecies.baseSpecies !== 'Cherrim' || pokemon.transformed) return;
			if (!pokemon.hp) return;
			if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
				if (pokemon.species.id !== 'cherrimsunshine') {
					pokemon.formeChange('Cherrim-Sunshine', this.effect, false, '0', '[msg]');
				}
			} else {
				if (pokemon.species.id === 'cherrimsunshine') {
					pokemon.formeChange('Cherrim', this.effect, false, '0', '[msg]');
				}
			}
		},
		onAllyModifyAtkPriority: 3,
		onAllyModifyAtk(atk, pokemon) {
			if (this.effectState.target.baseSpecies.baseSpecies !== 'Cherrim') return;
			if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(1.5);
			}
		},
		onAllyModifySpDPriority: 4,
		onAllyModifySpD(spd, pokemon) {
			if (this.effectState.target.baseSpecies.baseSpecies !== 'Cherrim') return;
			if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(1.5);
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, breakable: 1 },
		name: "Flower Gift",
		rating: 1,
		num: 122,
	},
	flowerveil: {
		onAllyTryBoost(boost, target, source, effect) {
			if ((source && target === source) || !target.hasType('Grass')) return;
			let showMsg = false;
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! < 0) {
					delete boost[i];
					showMsg = true;
				}
			}
			if (showMsg && !(effect as ActiveMove).secondaries) {
				const effectHolder = this.effectState.target;
				this.add('-block', target, 'ability: Flower Veil', `[of] ${effectHolder}`);
			}
		},
		onAllySetStatus(status, target, source, effect) {
			if (target.hasType('Grass') && source && target !== source && effect && effect.id !== 'yawn') {
				this.debug('interrupting setStatus with Flower Veil');
				if (effect.name === 'Synchronize' || (effect.effectType === 'Move' && !effect.secondaries)) {
					const effectHolder = this.effectState.target;
					this.add('-block', target, 'ability: Flower Veil', `[of] ${effectHolder}`);
				}
				return null;
			}
		},
		onAllyTryAddVolatile(status, target) {
			if (target.hasType('Grass') && status.id === 'yawn') {
				this.debug('Flower Veil blocking yawn');
				const effectHolder = this.effectState.target;
				this.add('-block', target, 'ability: Flower Veil', `[of] ${effectHolder}`);
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Flower Veil",
		rating: 0,
		num: 166,
	},
	fluffy: {
		onSourceModifyDamage(damage, source, target, move) {
			let mod = 1;
			if (move.type === 'Fire') mod *= 2;
			if (move.flags['contact']) mod /= 2;
			return this.chainModify(mod);
		},
		flags: { breakable: 1 },
		name: "Fluffy",
		rating: 3.5,
		num: 218,
	},
	forecast: {
		onSwitchInPriority: -2,
		onStart(pokemon) {
			this.singleEvent('WeatherChange', this.effect, this.effectState, pokemon);
		},
		onWeatherChange(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Castform' || pokemon.transformed) return;
			let forme = null;
			switch (pokemon.effectiveWeather()) {
			case 'sunnyday':
			case 'desolateland':
				if (pokemon.species.id !== 'castformsunny') forme = 'Castform-Sunny';
				break;
			case 'raindance':
			case 'primordialsea':
				if (pokemon.species.id !== 'castformrainy') forme = 'Castform-Rainy';
				break;
			case 'hail':
			case 'snowscape':
				if (pokemon.species.id !== 'castformsnowy') forme = 'Castform-Snowy';
				break;
			default:
				if (pokemon.species.id !== 'castform') forme = 'Castform';
				break;
			}
			if (pokemon.isActive && forme) {
				pokemon.formeChange(forme, this.effect, false, '0', '[msg]');
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1 },
		name: "Forecast",
		rating: 2,
		num: 59,
	},
	forewarn: {
		onStart(pokemon) {
			let warnMoves: (Move | Pokemon)[][] = [];
			let warnBp = 1;
			for (const target of pokemon.foes()) {
				for (const moveSlot of target.moveSlots) {
					const move = this.dex.moves.get(moveSlot.move);
					let bp = move.basePower;
					if (move.ohko) bp = 150;
					if (move.id === 'counter' || move.id === 'metalburst' || move.id === 'mirrorcoat') bp = 120;
					if (bp === 1) bp = 80;
					if (!bp && move.category !== 'Status') bp = 80;
					if (bp > warnBp) {
						warnMoves = [[move, target]];
						warnBp = bp;
					} else if (bp === warnBp) {
						warnMoves.push([move, target]);
					}
				}
			}
			if (!warnMoves.length) return;
			const [warnMoveName, warnTarget] = this.sample(warnMoves);
			this.add('-activate', pokemon, 'ability: Forewarn', warnMoveName, `[of] ${warnTarget}`);
		},
		flags: {},
		name: "Forewarn",
		rating: 0.5,
		num: 108,
	},
	friendguard: {
		onAnyModifyDamage(damage, source, target, move) {
			if (target !== this.effectState.target && target.isAlly(this.effectState.target)) {
				this.debug('Friend Guard weaken');
				return this.chainModify(0.75);
			}
		},
		flags: { breakable: 1 },
		name: "Friend Guard",
		rating: 0,
		num: 132,
	},
	frisk: {
		onStart(pokemon) {
			for (const target of pokemon.foes()) {
				if (target.item) {
					this.add('-item', target, target.getItem().name, '[from] ability: Frisk', `[of] ${pokemon}`);
				}
			}
		},
		flags: {},
		name: "Frisk",
		rating: 1.5,
		num: 119,
	},
	fullmetalbody: {
		onTryBoost(boost, target, source, effect) {
			if (source && target === source) return;
			let showMsg = false;
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! < 0) {
					delete boost[i];
					showMsg = true;
				}
			}
			if (showMsg && !(effect as ActiveMove).secondaries && effect.id !== 'octolock') {
				this.add("-fail", target, "unboost", "[from] ability: Full Metal Body", `[of] ${target}`);
			}
		},
		flags: {},
		name: "Full Metal Body",
		rating: 2,
		num: 230,
	},
	furcoat: {
		onModifyDefPriority: 6,
		onModifyDef(def) {
			return this.chainModify(2);
		},
		flags: { breakable: 1 },
		name: "Fur Coat",
		rating: 4,
		num: 169,
	},
	galewings: {
		onModifyPriority(priority, pokemon, target, move) {
			if (move?.type === 'Flying' && pokemon.hp === pokemon.maxhp) return priority + 1;
		},
		flags: {},
		name: "Gale Wings",
		rating: 1.5,
		num: 177,
	},
	galvanize: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status') && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Electric';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		flags: {},
		name: "Galvanize",
		rating: 4,
		num: 206,
	},
	gluttony: {
		onStart(pokemon) {
			pokemon.abilityState.gluttony = true;
		},
		onDamage(item, pokemon) {
			pokemon.abilityState.gluttony = true;
		},
		flags: {},
		name: "Gluttony",
		rating: 1.5,
		num: 82,
	},
	goodasgold: {
		onTryHit(target, source, move) {
			if (move.category === 'Status' && target !== source) {
				this.add('-immune', target, '[from] ability: Good as Gold');
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Good as Gold",
		rating: 5,
		num: 283,
	},
	gooey: {
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target, true)) {
				this.add('-ability', target, 'Gooey');
				this.boost({ spe: -1 }, source, target, null, true);
			}
		},
		flags: {},
		name: "Gooey",
		rating: 2,
		num: 183,
	},
	gorillatactics: {
		onStart(pokemon) {
			pokemon.abilityState.choiceLock = "";
		},
		onBeforeMove(pokemon, target, move) {
			if (move.isZOrMaxPowered || move.id === 'struggle') return;
			if (pokemon.abilityState.choiceLock && pokemon.abilityState.choiceLock !== move.id) {
				// Fails unless ability is being ignored (these events will not run), no PP lost.
				this.addMove('move', pokemon, move.name);
				this.attrLastMove('[still]');
				this.debug("Disabled by Gorilla Tactics");
				this.add('-fail', pokemon);
				return false;
			}
		},
		onModifyMove(move, pokemon) {
			if (pokemon.abilityState.choiceLock || move.isZOrMaxPowered || move.id === 'struggle') return;
			pokemon.abilityState.choiceLock = move.id;
		},
		onModifyAtkPriority: 1,
		onModifyAtk(atk, pokemon) {
			if (pokemon.volatiles['dynamax']) return;
			// PLACEHOLDER
			this.debug('Gorilla Tactics Atk Boost');
			return this.chainModify(1.5);
		},
		onDisableMove(pokemon) {
			if (!pokemon.abilityState.choiceLock) return;
			if (pokemon.volatiles['dynamax']) return;
			for (const moveSlot of pokemon.moveSlots) {
				if (moveSlot.id !== pokemon.abilityState.choiceLock) {
					pokemon.disableMove(moveSlot.id, false, this.effectState.sourceEffect);
				}
			}
		},
		onEnd(pokemon) {
			pokemon.abilityState.choiceLock = "";
		},
		flags: {},
		name: "Gorilla Tactics",
		rating: 4.5,
		num: 255,
	},
	grasspelt: {
		onModifyDefPriority: 6,
		onModifyDef(pokemon) {
			if (this.field.isTerrain('grassyterrain')) return this.chainModify(1.5);
		},
		flags: { breakable: 1 },
		name: "Grass Pelt",
		rating: 0.5,
		num: 179,
	},
	grassysurge: {
		onStart(source) {
			this.field.setTerrain('grassyterrain');
		},
		flags: {},
		name: "Grassy Surge",
		rating: 4,
		num: 229,
	},
	grimneigh: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === 'Move') {
				this.boost({ spa: length }, source);
			}
		},
		flags: {},
		name: "Grim Neigh",
		rating: 3,
		num: 265,
	},
	guarddog: {
		onDragOutPriority: 1,
		onDragOut(pokemon) {
			this.add('-activate', pokemon, 'ability: Guard Dog');
			return null;
		},
		onTryBoostPriority: 2,
		onTryBoost(boost, target, source, effect) {
			if (effect.name === 'Intimidate' && boost.atk) {
				delete boost.atk;
				this.boost({ atk: 1 }, target, target, null, false, true);
			}
		},
		flags: { breakable: 1 },
		name: "Guard Dog",
		rating: 2,
		num: 275,
	},
	gulpmissile: {
		onDamagingHit(damage, target, source, move) {
			if (!source.hp || !source.isActive || target.isSemiInvulnerable()) return;
			if (['cramorantgulping', 'cramorantgorging'].includes(target.species.id)) {
				this.damage(source.baseMaxhp / 4, source, target);
				if (target.species.id === 'cramorantgulping') {
					this.boost({ def: -1 }, source, target, null, true);
				} else {
					source.trySetStatus('par', target, move);
				}
				target.formeChange('cramorant', move);
			}
		},
		// The Dive part of this mechanic is implemented in Dive's `onTryMove` in moves.ts
		onSourceTryPrimaryHit(target, source, effect) {
			if (effect?.id === 'surf' && source.hasAbility('gulpmissile') && source.species.name === 'Cramorant') {
				const forme = source.hp <= source.maxhp / 2 ? 'cramorantgorging' : 'cramorantgulping';
				source.formeChange(forme, effect);
			}
		},
		flags: { cantsuppress: 1, notransform: 1 },
		name: "Gulp Missile",
		rating: 2.5,
		num: 241,
	},
	guts: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, pokemon) {
			if (pokemon.status) {
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Guts",
		rating: 3.5,
		num: 62,
	},
	hadronengine: {
		onStart(pokemon) {
			if (!this.field.setTerrain('electricterrain') && this.field.isTerrain('electricterrain')) {
				this.add('-activate', pokemon, 'ability: Hadron Engine');
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (this.field.isTerrain('electricterrain')) {
				this.debug('Hadron Engine boost');
				return this.chainModify([5461, 4096]);
			}
		},
		flags: {},
		name: "Hadron Engine",
		rating: 4.5,
		num: 289,
	},
	harvest: {
		onResidualOrder: 28,
		onResidualSubOrder: 2,
		onResidual(pokemon) {
			if (this.field.isWeather(['sunnyday', 'desolateland']) || this.randomChance(1, 2)) {
				if (pokemon.hp && !pokemon.item && this.dex.items.get(pokemon.lastItem).isBerry) {
					pokemon.setItem(pokemon.lastItem);
					pokemon.lastItem = '';
					this.add('-item', pokemon, pokemon.getItem(), '[from] ability: Harvest');
				}
			}
		},
		flags: {},
		name: "Harvest",
		rating: 2.5,
		num: 139,
	},
	healer: {
		onResidualOrder: 5,
		onResidualSubOrder: 3,
		onResidual(pokemon) {
			for (const allyActive of pokemon.adjacentAllies()) {
				if (allyActive.status && this.randomChance(3, 10)) {
					this.add('-activate', pokemon, 'ability: Healer');
					allyActive.cureStatus();
				}
			}
		},
		flags: {},
		name: "Healer",
		rating: 0,
		num: 131,
	},
	heatproof: {
		onSourceModifyAtkPriority: 6,
		onSourceModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Fire') {
				this.debug('Heatproof Atk weaken');
				return this.chainModify(0.5);
			}
		},
		onSourceModifySpAPriority: 5,
		onSourceModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Fire') {
				this.debug('Heatproof SpA weaken');
				return this.chainModify(0.5);
			}
		},
		onDamage(damage, target, source, effect) {
			if (effect && effect.id === 'brn') {
				return damage / 2;
			}
		},
		flags: { breakable: 1 },
		name: "Heatproof",
		rating: 2,
		num: 85,
	},
	heavymetal: {
		onModifyWeightPriority: 1,
		onModifyWeight(weighthg) {
			return weighthg * 2;
		},
		flags: { breakable: 1 },
		name: "Heavy Metal",
		rating: 0,
		num: 134,
	},
	honeygather: {
		flags: {},
		name: "Honey Gather",
		rating: 0,
		num: 118,
	},
	hospitality: {
		onSwitchInPriority: -2,
		onStart(pokemon) {
			for (const ally of pokemon.adjacentAllies()) {
				this.heal(ally.baseMaxhp / 4, ally, pokemon);
			}
		},
		flags: {},
		name: "Hospitality",
		rating: 0,
		num: 299,
	},
	hugepower: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk) {
			return this.chainModify(2);
		},
		flags: {},
		name: "Huge Power",
		rating: 5,
		num: 37,
	},
	hungerswitch: {
		onResidualOrder: 29,
		onResidual(pokemon) {
			if (pokemon.species.baseSpecies !== 'Morpeko' || pokemon.terastallized) return;
			const targetForme = pokemon.species.name === 'Morpeko' ? 'Morpeko-Hangry' : 'Morpeko';
			pokemon.formeChange(targetForme);
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, notransform: 1 },
		name: "Hunger Switch",
		rating: 1,
		num: 258,
	},
	hustle: {
		// This should be applied directly to the stat as opposed to chaining with the others
		onModifyAtkPriority: 5,
		onModifyAtk(atk) {
			return this.modify(atk, 1.5);
		},
		onSourceModifyAccuracyPriority: -1,
		onSourceModifyAccuracy(accuracy, target, source, move) {
			if (move.category === 'Physical' && typeof accuracy === 'number') {
				return this.chainModify([3277, 4096]);
			}
		},
		flags: {},
		name: "Hustle",
		rating: 3.5,
		num: 55,
	},
	hydration: {
		onResidualOrder: 5,
		onResidualSubOrder: 3,
		onResidual(pokemon) {
			if (pokemon.status && ['raindance', 'primordialsea'].includes(pokemon.effectiveWeather())) {
				this.debug('hydration');
				this.add('-activate', pokemon, 'ability: Hydration');
				pokemon.cureStatus();
			}
		},
		flags: {},
		name: "Hydration",
		rating: 1.5,
		num: 93,
	},
	hypercutter: {
		onTryBoost(boost, target, source, effect) {
			if (source && target === source) return;
			if (boost.atk && boost.atk < 0) {
				delete boost.atk;
				if (!(effect as ActiveMove).secondaries) {
					this.add("-fail", target, "unboost", "Attack", "[from] ability: Hyper Cutter", `[of] ${target}`);
				}
			}
		},
		flags: { breakable: 1 },
		name: "Hyper Cutter",
		rating: 1.5,
		num: 52,
	},
	icebody: {
		onWeather(target, source, effect) {
			if (effect.id === 'hail' || effect.id === 'snowscape') {
				this.heal(target.baseMaxhp / 16);
			}
		},
		onImmunity(type, pokemon) {
			if (type === 'hail') return false;
		},
		flags: {},
		name: "Ice Body",
		rating: 1,
		num: 115,
	},
	iceface: {
		onSwitchInPriority: -2,
		onStart(pokemon) {
			if (this.field.isWeather(['hail', 'snowscape']) && pokemon.species.id === 'eiscuenoice') {
				this.add('-activate', pokemon, 'ability: Ice Face');
				this.effectState.busted = false;
				pokemon.formeChange('Eiscue', this.effect, true);
			}
		},
		onDamagePriority: 1,
		onDamage(damage, target, source, effect) {
			if (effect?.effectType === 'Move' && effect.category === 'Physical' && target.species.id === 'eiscue') {
				this.add('-activate', target, 'ability: Ice Face');
				this.effectState.busted = true;
				return 0;
			}
		},
		onCriticalHit(target, type, move) {
			if (!target) return;
			if (move.category !== 'Physical' || target.species.id !== 'eiscue') return;
			if (target.volatiles['substitute'] && !(move.flags['bypasssub'] || move.infiltrates)) return;
			if (!target.runImmunity(move)) return;
			return false;
		},
		onEffectiveness(typeMod, target, type, move) {
			if (!target) return;
			if (move.category !== 'Physical' || target.species.id !== 'eiscue') return;

			const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
			if (hitSub) return;

			if (!target.runImmunity(move)) return;
			return 0;
		},
		onUpdate(pokemon) {
			if (pokemon.species.id === 'eiscue' && this.effectState.busted) {
				pokemon.formeChange('Eiscue-Noice', this.effect, true);
			}
		},
		onWeatherChange(pokemon, source, sourceEffect) {
			// snow/hail resuming because Cloud Nine/Air Lock ended does not trigger Ice Face
			if ((sourceEffect as Ability)?.suppressWeather) return;
			if (!pokemon.hp) return;
			if (this.field.isWeather(['hail', 'snowscape']) && pokemon.species.id === 'eiscuenoice') {
				this.add('-activate', pokemon, 'ability: Ice Face');
				this.effectState.busted = false;
				pokemon.formeChange('Eiscue', this.effect, true);
			}
		},
		flags: {
			failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1,
			breakable: 1, notransform: 1,
		},
		name: "Ice Face",
		rating: 3,
		num: 248,
	},
	icescales: {
		onSourceModifyDamage(damage, source, target, move) {
			if (move.category === 'Special') {
				return this.chainModify(0.5);
			}
		},
		flags: { breakable: 1 },
		name: "Ice Scales",
		rating: 4,
		num: 246,
	},
	illuminate: {
		onTryBoost(boost, target, source, effect) {
			if (source && target === source) return;
			if (boost.accuracy && boost.accuracy < 0) {
				delete boost.accuracy;
				if (!(effect as ActiveMove).secondaries) {
					this.add("-fail", target, "unboost", "accuracy", "[from] ability: Illuminate", `[of] ${target}`);
				}
			}
		},
		onModifyMove(move) {
			move.ignoreEvasion = true;
		},
		flags: { breakable: 1 },
		name: "Illuminate",
		rating: 0.5,
		num: 35,
	},
	illusion: {
		onBeforeSwitchIn(pokemon) {
			pokemon.illusion = null;
			// yes, you can Illusion an active pokemon but only if it's to your right
			for (let i = pokemon.side.pokemon.length - 1; i > pokemon.position; i--) {
				const possibleTarget = pokemon.side.pokemon[i];
				if (!possibleTarget.fainted) {
					// If Ogerpon is in the last slot while the Illusion Pokemon is Terastallized
					// Illusion will not disguise as anything
					if (!pokemon.terastallized || !['Ogerpon', 'Terapagos'].includes(possibleTarget.species.baseSpecies)) {
						pokemon.illusion = possibleTarget;
					}
					break;
				}
			}
		},
		onDamagingHit(damage, target, source, move) {
			if (target.illusion) {
				this.singleEvent('End', this.dex.abilities.get('Illusion'), target.abilityState, target, source, move);
			}
		},
		onEnd(pokemon) {
			if (pokemon.illusion) {
				this.debug('illusion cleared');
				pokemon.illusion = null;
				const details = pokemon.getUpdatedDetails();
				this.add('replace', pokemon, details);
				this.add('-end', pokemon, 'Illusion');
				if (this.ruleTable.has('illusionlevelmod')) {
					this.hint("Illusion Level Mod is active, so this Pok\u00e9mon's true level was hidden.", true);
				}
			}
		},
		onFaint(pokemon) {
			pokemon.illusion = null;
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1 },
		name: "Illusion",
		rating: 4.5,
		num: 149,
	},
	immunity: {
		onUpdate(pokemon) {
			if (pokemon.status === 'psn' || pokemon.status === 'tox') {
				this.add('-activate', pokemon, 'ability: Immunity');
				pokemon.cureStatus();
			}
		},
		onSetStatus(status, target, source, effect) {
			if (status.id !== 'psn' && status.id !== 'tox') return;
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Immunity');
			}
			return false;
		},
		flags: { breakable: 1 },
		name: "Immunity",
		rating: 2,
		num: 17,
	},
	imposter: {
		onSwitchIn(pokemon) {
			// Imposter does not activate when Skill Swapped or when Neutralizing Gas leaves the field
			// Imposter copies across in doubles/triples
			// (also copies across in multibattle and diagonally in free-for-all,
			// but side.foe already takes care of those)
			const target = pokemon.side.foe.active[pokemon.side.foe.active.length - 1 - pokemon.position];
			if (target) {
				pokemon.transformInto(target, this.dex.abilities.get('imposter'));
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1 },
		name: "Imposter",
		rating: 5,
		num: 150,
	},
	infiltrator: {
		onModifyMove(move) {
			move.infiltrates = true;
		},
		flags: {},
		name: "Infiltrator",
		rating: 2.5,
		num: 151,
	},
	innardsout: {
		onDamagingHitOrder: 1,
		onDamagingHit(damage, target, source, move) {
			if (!target.hp) {
				this.damage(target.getUndynamaxedHP(damage), source, target);
			}
		},
		flags: {},
		name: "Innards Out",
		rating: 4,
		num: 215,
	},
	innerfocus: {
		onTryAddVolatile(status, pokemon) {
			if (status.id === 'flinch') return null;
		},
		onTryBoost(boost, target, source, effect) {
			if (effect.name === 'Intimidate' && boost.atk) {
				delete boost.atk;
				this.add('-fail', target, 'unboost', 'Attack', '[from] ability: Inner Focus', `[of] ${target}`);
			}
		},
		flags: { breakable: 1 },
		name: "Inner Focus",
		rating: 1,
		num: 39,
	},
	insomnia: {
		onUpdate(pokemon) {
			if (pokemon.status === 'slp') {
				this.add('-activate', pokemon, 'ability: Insomnia');
				pokemon.cureStatus();
			}
		},
		onSetStatus(status, target, source, effect) {
			if (status.id !== 'slp') return;
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Insomnia');
			}
			return false;
		},
		onTryAddVolatile(status, target) {
			if (status.id === 'yawn') {
				this.add('-immune', target, '[from] ability: Insomnia');
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Insomnia",
		rating: 1.5,
		num: 15,
	},
	intimidate: {
		onStart(pokemon) {
			let activated = false;
			for (const target of pokemon.adjacentFoes()) {
				if (!activated) {
					this.add('-ability', pokemon, 'Intimidate', 'boost');
					activated = true;
				}
				if (target.volatiles['substitute']) {
					this.add('-immune', target);
				} else {
					this.boost({ atk: -1 }, target, pokemon, null, true);
				}
			}
		},
		flags: {},
		name: "Intimidate",
		rating: 3.5,
		num: 22,
	},
	intrepidsword: {
		onStart(pokemon) {
			if (pokemon.swordBoost) return;
			pokemon.swordBoost = true;
			this.boost({ atk: 1 }, pokemon);
		},
		flags: {},
		name: "Intrepid Sword",
		rating: 4,
		num: 234,
	},
	ironbarbs: {
		onDamagingHitOrder: 1,
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target, true)) {
				this.damage(source.baseMaxhp / 8, source, target);
			}
		},
		flags: {},
		name: "Iron Barbs",
		rating: 2.5,
		num: 160,
	},
	ironfist: {
		onBasePowerPriority: 23,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['punch']) {
				this.debug('Iron Fist boost');
				return this.chainModify([4915, 4096]);
			}
		},
		flags: {},
		name: "Iron Fist",
		rating: 3,
		num: 89,
	},
	justified: {
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Dark') {
				this.boost({ atk: 1 });
			}
		},
		flags: {},
		name: "Justified",
		rating: 2.5,
		num: 154,
	},
	keeneye: {
		onTryBoost(boost, target, source, effect) {
			if (source && target === source) return;
			if (boost.accuracy && boost.accuracy < 0) {
				delete boost.accuracy;
				if (!(effect as ActiveMove).secondaries) {
					this.add("-fail", target, "unboost", "accuracy", "[from] ability: Keen Eye", `[of] ${target}`);
				}
			}
		},
		onModifyMove(move) {
			move.ignoreEvasion = true;
		},
		flags: { breakable: 1 },
		name: "Keen Eye",
		rating: 0.5,
		num: 51,
	},
	klutz: {
		// Klutz isn't technically active immediately in-game, but it activates early enough to beat all items
		// we should keep an eye out in future gens for items that activate on switch-in before Unnerve
		onSwitchInPriority: 1,
		// Item suppression implemented in Pokemon.ignoringItem() within sim/pokemon.js
		onStart(pokemon) {
			this.singleEvent('End', pokemon.getItem(), pokemon.itemState, pokemon);
		},
		flags: {},
		name: "Klutz",
		rating: -1,
		num: 103,
	},
	leafguard: {
		onSetStatus(status, target, source, effect) {
			if (['sunnyday', 'desolateland'].includes(target.effectiveWeather())) {
				if ((effect as Move)?.status) {
					this.add('-immune', target, '[from] ability: Leaf Guard');
				}
				return false;
			}
		},
		onTryAddVolatile(status, target) {
			if (status.id === 'yawn' && ['sunnyday', 'desolateland'].includes(target.effectiveWeather())) {
				this.add('-immune', target, '[from] ability: Leaf Guard');
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Leaf Guard",
		rating: 0.5,
		num: 102,
	},
	levitate: {
		// airborneness implemented in sim/pokemon.js:Pokemon#isGrounded
		flags: { breakable: 1 },
		name: "Levitate",
		rating: 3.5,
		num: 26,
	},
	libero: {
		onPrepareHit(source, target, move) {
			if (this.effectState.libero === source.previouslySwitchedIn) return;
			if (move.hasBounced || move.flags['futuremove'] || move.sourceEffect === 'snatch' || move.callsMove) return;
			const type = move.type;
			if (type && type !== '???' && source.getTypes().join() !== type) {
				if (!source.setType(type)) return;
				this.effectState.libero = source.previouslySwitchedIn;
				this.add('-start', source, 'typechange', type, '[from] ability: Libero');
			}
		},
		flags: {},
		name: "Libero",
		rating: 4,
		num: 236,
	},
	lightmetal: {
		onModifyWeight(weighthg) {
			return this.trunc(weighthg / 2);
		},
		flags: { breakable: 1 },
		name: "Light Metal",
		rating: 1,
		num: 135,
	},
	lightningrod: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Electric') {
				if (!this.boost({ spa: 1 })) {
					this.add('-immune', target, '[from] ability: Lightning Rod');
				}
				return null;
			}
		},
		onAnyRedirectTarget(target, source, source2, move) {
			if (move.type !== 'Electric' || move.flags['pledgecombo']) return;
			const redirectTarget = ['randomNormal', 'adjacentFoe'].includes(move.target) ? 'normal' : move.target;
			if (this.validTarget(this.effectState.target, source, redirectTarget)) {
				if (move.smartTarget) move.smartTarget = false;
				if (this.effectState.target !== target) {
					this.add('-activate', this.effectState.target, 'ability: Lightning Rod');
				}
				return this.effectState.target;
			}
		},
		flags: { breakable: 1 },
		name: "Lightning Rod",
		rating: 3,
		num: 31,
	},
	limber: {
		onUpdate(pokemon) {
			if (pokemon.status === 'par') {
				this.add('-activate', pokemon, 'ability: Limber');
				pokemon.cureStatus();
			}
		},
		onSetStatus(status, target, source, effect) {
			if (status.id !== 'par') return;
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Limber');
			}
			return false;
		},
		flags: { breakable: 1 },
		name: "Limber",
		rating: 2,
		num: 7,
	},
	lingeringaroma: {
		onDamagingHit(damage, target, source, move) {
			const sourceAbility = source.getAbility();
			if (sourceAbility.flags['cantsuppress'] || sourceAbility.id === 'lingeringaroma') {
				return;
			}
			if (this.checkMoveMakesContact(move, source, target, !source.isAlly(target))) {
				const oldAbility = source.setAbility('lingeringaroma', target);
				if (oldAbility) {
					this.add('-activate', target, 'ability: Lingering Aroma', this.dex.abilities.get(oldAbility).name, `[of] ${source}`);
				}
			}
		},
		flags: {},
		name: "Lingering Aroma",
		rating: 2,
		num: 268,
	},
	liquidooze: {
		onSourceTryHeal(damage, target, source, effect) {
			this.debug(`Heal is occurring: ${target} <- ${source} :: ${effect.id}`);
			const canOoze = ['drain', 'leechseed', 'strengthsap'];
			if (canOoze.includes(effect.id)) {
				this.damage(damage);
				return 0;
			}
		},
		flags: {},
		name: "Liquid Ooze",
		rating: 2.5,
		num: 64,
	},
	liquidvoice: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			if (move.flags['sound'] && !pokemon.volatiles['dynamax']) { // hardcode
				move.type = 'Water';
			}
		},
		flags: {},
		name: "Liquid Voice",
		rating: 1.5,
		num: 204,
	},
	longreach: {
		onModifyMove(move) {
			delete move.flags['contact'];
		},
		flags: {},
		name: "Long Reach",
		rating: 1,
		num: 203,
	},
	magicbounce: {
		onTryHitPriority: 1,
		onTryHit(target, source, move) {
			if (target === source || move.hasBounced || !move.flags['reflectable'] || target.isSemiInvulnerable()) {
				return;
			}
			const newMove = this.dex.getActiveMove(move.id);
			newMove.hasBounced = true;
			newMove.pranksterBoosted = false;
			this.actions.useMove(newMove, target, { target: source });
			return null;
		},
		onAllyTryHitSide(target, source, move) {
			if (target.isAlly(source) || move.hasBounced || !move.flags['reflectable'] || target.isSemiInvulnerable()) {
				return;
			}
			const newMove = this.dex.getActiveMove(move.id);
			newMove.hasBounced = true;
			newMove.pranksterBoosted = false;
			this.actions.useMove(newMove, this.effectState.target, { target: source });
			move.hasBounced = true; // only bounce once in free-for-all battles
			return null;
		},
		condition: {
			duration: 1,
		},
		flags: { breakable: 1 },
		name: "Magic Bounce",
		rating: 4,
		num: 156,
	},
	magicguard: {
		onDamage(damage, target, source, effect) {
			if (effect.effectType !== 'Move') {
				if (effect.effectType === 'Ability') this.add('-activate', source, 'ability: ' + effect.name);
				return false;
			}
		},
		flags: {},
		name: "Magic Guard",
		rating: 4,
		num: 98,
	},
	magician: {
		onAfterMoveSecondarySelf(source, target, move) {
			if (!move || source.switchFlag === true || !move.hitTargets || source.item || source.volatiles['gem'] ||
				move.id === 'fling' || move.category === 'Status') return;
			const hitTargets = move.hitTargets;
			this.speedSort(hitTargets);
			for (const pokemon of hitTargets) {
				if (pokemon !== source) {
					const yourItem = pokemon.takeItem(source);
					if (!yourItem) continue;
					if (!source.setItem(yourItem)) {
						pokemon.item = yourItem.id; // bypass setItem so we don't break choicelock or anything
						continue;
					}
					this.add('-item', source, yourItem, '[from] ability: Magician', `[of] ${pokemon}`);
					return;
				}
			}
		},
		flags: {},
		name: "Magician",
		rating: 1,
		num: 170,
	},
	magmaarmor: {
		onUpdate(pokemon) {
			if (pokemon.status === 'frz') {
				this.add('-activate', pokemon, 'ability: Magma Armor');
				pokemon.cureStatus();
			}
		},
		onImmunity(type, pokemon) {
			if (type === 'frz') return false;
		},
		flags: { breakable: 1 },
		name: "Magma Armor",
		rating: 0.5,
		num: 40,
	},
	magnetpull: {
		onFoeTrapPokemon(pokemon) {
			if (pokemon.hasType('Steel') && pokemon.isAdjacent(this.effectState.target)) {
				pokemon.tryTrap(true);
			}
		},
		onFoeMaybeTrapPokemon(pokemon, source) {
			if (!source) source = this.effectState.target;
			if (!source || !pokemon.isAdjacent(source)) return;
			if (!pokemon.knownType || pokemon.hasType('Steel')) {
				pokemon.maybeTrapped = true;
			}
		},
		flags: {},
		name: "Magnet Pull",
		rating: 4,
		num: 42,
	},
	marvelscale: {
		onModifyDefPriority: 6,
		onModifyDef(def, pokemon) {
			if (pokemon.status) {
				return this.chainModify(1.5);
			}
		},
		flags: { breakable: 1 },
		name: "Marvel Scale",
		rating: 2.5,
		num: 63,
	},
	megalauncher: {
		onBasePowerPriority: 19,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['pulse']) {
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Mega Launcher",
		rating: 3,
		num: 178,
	},
	merciless: {
		onModifyCritRatio(critRatio, source, target) {
			if (target && ['psn', 'tox'].includes(target.status)) return 5;
		},
		flags: {},
		name: "Merciless",
		rating: 1.5,
		num: 196,
	},
	mimicry: {
		onSwitchInPriority: -1,
		onStart(pokemon) {
			this.singleEvent('TerrainChange', this.effect, this.effectState, pokemon);
		},
		onTerrainChange(pokemon) {
			let types;
			switch (this.field.terrain) {
			case 'electricterrain':
				types = ['Electric'];
				break;
			case 'grassyterrain':
				types = ['Grass'];
				break;
			case 'mistyterrain':
				types = ['Fairy'];
				break;
			case 'psychicterrain':
				types = ['Psychic'];
				break;
			default:
				types = pokemon.baseSpecies.types;
			}
			const oldTypes = pokemon.getTypes();
			if (oldTypes.join() === types.join() || !pokemon.setType(types)) return;
			if (this.field.terrain || pokemon.transformed) {
				this.add('-start', pokemon, 'typechange', types.join('/'), '[from] ability: Mimicry');
				if (!this.field.terrain) this.hint("Transform Mimicry changes you to your original un-transformed types.");
			} else {
				this.add('-activate', pokemon, 'ability: Mimicry');
				this.add('-end', pokemon, 'typechange', '[silent]');
			}
		},
		flags: {},
		name: "Mimicry",
		rating: 0,
		num: 250,
	},
	mindseye: {
		onTryBoost(boost, target, source, effect) {
			if (source && target === source) return;
			if (boost.accuracy && boost.accuracy < 0) {
				delete boost.accuracy;
				if (!(effect as ActiveMove).secondaries) {
					this.add("-fail", target, "unboost", "accuracy", "[from] ability: Mind's Eye", `[of] ${target}`);
				}
			}
		},
		onModifyMovePriority: -5,
		onModifyMove(move) {
			move.ignoreEvasion = true;
			if (!move.ignoreImmunity) move.ignoreImmunity = {};
			if (move.ignoreImmunity !== true) {
				move.ignoreImmunity['Fighting'] = true;
				move.ignoreImmunity['Normal'] = true;
			}
		},
		flags: { breakable: 1 },
		name: "Mind's Eye",
		rating: 0,
		num: 300,
	},
	minus: {
		onModifySpAPriority: 5,
		onModifySpA(spa, pokemon) {
			for (const allyActive of pokemon.allies()) {
				if (allyActive.hasAbility(['minus', 'plus'])) {
					return this.chainModify(1.5);
				}
			}
		},
		flags: {},
		name: "Minus",
		rating: 0,
		num: 58,
	},
	mirrorarmor: {
		onTryBoost(boost, target, source, effect) {
			// Don't bounce self stat changes, or boosts that have already bounced
			if (!source || target === source || !boost || effect.name === 'Mirror Armor') return;
			let b: BoostID;
			for (b in boost) {
				if (boost[b]! < 0) {
					if (target.boosts[b] === -6) continue;
					const negativeBoost: SparseBoostsTable = {};
					negativeBoost[b] = boost[b];
					delete boost[b];
					if (source.hp) {
						this.add('-ability', target, 'Mirror Armor');
						this.boost(negativeBoost, source, target, null, true);
					}
				}
			}
		},
		flags: { breakable: 1 },
		name: "Mirror Armor",
		rating: 2,
		num: 240,
	},
	mistysurge: {
		onStart(source) {
			this.field.setTerrain('mistyterrain');
		},
		flags: {},
		name: "Misty Surge",
		rating: 3.5,
		num: 228,
	},
	moldbreaker: {
		onStart(pokemon) {
			this.add('-ability', pokemon, 'Mold Breaker');
		},
		onModifyMove(move) {
			move.ignoreAbility = true;
		},
		flags: {},
		name: "Mold Breaker",
		rating: 3,
		num: 104,
	},
	moody: {
		onResidualOrder: 28,
		onResidualSubOrder: 2,
		onResidual(pokemon) {
			let stats: BoostID[] = [];
			const boost: SparseBoostsTable = {};
			let statPlus: BoostID;
			for (statPlus in pokemon.boosts) {
				if (statPlus === 'accuracy' || statPlus === 'evasion') continue;
				if (pokemon.boosts[statPlus] < 6) {
					stats.push(statPlus);
				}
			}
			let randomStat: BoostID | undefined = stats.length ? this.sample(stats) : undefined;
			if (randomStat) boost[randomStat] = 2;

			stats = [];
			let statMinus: BoostID;
			for (statMinus in pokemon.boosts) {
				if (statMinus === 'accuracy' || statMinus === 'evasion') continue;
				if (pokemon.boosts[statMinus] > -6 && statMinus !== randomStat) {
					stats.push(statMinus);
				}
			}
			randomStat = stats.length ? this.sample(stats) : undefined;
			if (randomStat) boost[randomStat] = -1;

			this.boost(boost, pokemon, pokemon);
		},
		flags: {},
		name: "Moody",
		rating: 5,
		num: 141,
	},
	motordrive: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Electric') {
				if (!this.boost({ spe: 1 })) {
					this.add('-immune', target, '[from] ability: Motor Drive');
				}
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Motor Drive",
		rating: 3,
		num: 78,
	},
	moxie: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === 'Move') {
				this.boost({ atk: length }, source);
			}
		},
		flags: {},
		name: "Moxie",
		rating: 3,
		num: 153,
	},
	multiscale: {
		onSourceModifyDamage(damage, source, target, move) {
			if (target.hp >= target.maxhp) {
				this.debug('Multiscale weaken');
				return this.chainModify(0.5);
			}
		},
		flags: { breakable: 1 },
		name: "Multiscale",
		rating: 3.5,
		num: 136,
	},
	multitype: {
		// Multitype's type-changing itself is implemented in statuses.js
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Multitype",
		rating: 4,
		num: 121,
	},
	mummy: {
		onDamagingHit(damage, target, source, move) {
			const sourceAbility = source.getAbility();
			if (sourceAbility.flags['cantsuppress'] || sourceAbility.id === 'mummy') {
				return;
			}
			if (this.checkMoveMakesContact(move, source, target, !source.isAlly(target))) {
				const oldAbility = source.setAbility('mummy', target);
				if (oldAbility) {
					this.add('-activate', target, 'ability: Mummy', this.dex.abilities.get(oldAbility).name, `[of] ${source}`);
				}
			}
		},
		flags: {},
		name: "Mummy",
		rating: 2,
		num: 152,
	},
	myceliummight: {
		onFractionalPriorityPriority: -1,
		onFractionalPriority(priority, pokemon, target, move) {
			if (move.category === 'Status') {
				return -0.1;
			}
		},
		onModifyMove(move) {
			if (move.category === 'Status') {
				move.ignoreAbility = true;
			}
		},
		flags: {},
		name: "Mycelium Might",
		rating: 2,
		num: 298,
	},
	naturalcure: {
		onCheckShow(pokemon) {
			// This is complicated
			// For the most part, in-game, it's obvious whether or not Natural Cure activated,
			// since you can see how many of your opponent's pokemon are statused.
			// The only ambiguous situation happens in Doubles/Triples, where multiple pokemon
			// that could have Natural Cure switch out, but only some of them get cured.
			if (pokemon.side.active.length === 1) return;
			if (pokemon.showCure === true || pokemon.showCure === false) return;

			const cureList = [];
			let noCureCount = 0;
			for (const curPoke of pokemon.side.active) {
				// pokemon not statused
				if (!curPoke?.status) {
					// this.add('-message', "" + curPoke + " skipped: not statused or doesn't exist");
					continue;
				}
				if (curPoke.showCure) {
					// this.add('-message', "" + curPoke + " skipped: Natural Cure already known");
					continue;
				}
				const species = curPoke.species;
				// pokemon can't get Natural Cure
				if (!Object.values(species.abilities).includes('Natural Cure')) {
					// this.add('-message', "" + curPoke + " skipped: no Natural Cure");
					continue;
				}
				// pokemon's ability is known to be Natural Cure
				if (!species.abilities['1'] && !species.abilities['H']) {
					// this.add('-message', "" + curPoke + " skipped: only one ability");
					continue;
				}
				// pokemon isn't switching this turn
				if (curPoke !== pokemon && !this.queue.willSwitch(curPoke)) {
					// this.add('-message', "" + curPoke + " skipped: not switching");
					continue;
				}

				if (curPoke.hasAbility('naturalcure')) {
					// this.add('-message', "" + curPoke + " confirmed: could be Natural Cure (and is)");
					cureList.push(curPoke);
				} else {
					// this.add('-message', "" + curPoke + " confirmed: could be Natural Cure (but isn't)");
					noCureCount++;
				}
			}

			if (!cureList.length || !noCureCount) {
				// It's possible to know what pokemon were cured
				for (const pkmn of cureList) {
					pkmn.showCure = true;
				}
			} else {
				// It's not possible to know what pokemon were cured

				// Unlike a -hint, this is real information that battlers need, so we use a -message
				this.add('-message', `(${cureList.length} of ${pokemon.side.name}'s pokemon ${cureList.length === 1 ? "was" : "were"} cured by Natural Cure.)`);

				for (const pkmn of cureList) {
					pkmn.showCure = false;
				}
			}
		},
		onSwitchOut(pokemon) {
			if (!pokemon.status) return;

			// if pokemon.showCure is undefined, it was skipped because its ability
			// is known
			if (pokemon.showCure === undefined) pokemon.showCure = true;

			if (pokemon.showCure) this.add('-curestatus', pokemon, pokemon.status, '[from] ability: Natural Cure');
			pokemon.clearStatus();

			// only reset .showCure if it's false
			// (once you know a Pokemon has Natural Cure, its cures are always known)
			if (!pokemon.showCure) pokemon.showCure = undefined;
		},
		flags: {},
		name: "Natural Cure",
		rating: 2.5,
		num: 30,
	},
	neuroforce: {
		onModifyDamage(damage, source, target, move) {
			if (move && target.getMoveHitData(move).typeMod > 0) {
				return this.chainModify([5120, 4096]);
			}
		},
		flags: {},
		name: "Neuroforce",
		rating: 2.5,
		num: 233,
	},
	neutralizinggas: {
		// Ability suppression implemented in sim/pokemon.ts:Pokemon#ignoringAbility
		onSwitchInPriority: 2,
		onSwitchIn(pokemon) {
			this.add('-ability', pokemon, 'Neutralizing Gas');
			pokemon.abilityState.ending = false;
			const strongWeathers = ['desolateland', 'primordialsea', 'deltastream'];
			for (const target of this.getAllActive()) {
				if (target.hasItem('Ability Shield')) {
					this.add('-block', target, 'item: Ability Shield');
					continue;
				}
				// Can't suppress a Tatsugiri inside of Dondozo already
				if (target.volatiles['commanding']) {
					continue;
				}
				if (target.illusion) {
					this.singleEvent('End', this.dex.abilities.get('Illusion'), target.abilityState, target, pokemon, 'neutralizinggas');
				}
				if (target.volatiles['slowstart']) {
					delete target.volatiles['slowstart'];
					this.add('-end', target, 'Slow Start', '[silent]');
				}
				if (strongWeathers.includes(target.getAbility().id)) {
					this.singleEvent('End', this.dex.abilities.get(target.getAbility().id), target.abilityState, target, pokemon, 'neutralizinggas');
				}
			}
		},
		onEnd(source) {
			if (source.transformed) return;
			for (const pokemon of this.getAllActive()) {
				if (pokemon !== source && pokemon.hasAbility('Neutralizing Gas')) {
					return;
				}
			}
			this.add('-end', source, 'ability: Neutralizing Gas');

			// FIXME this happens before the pokemon switches out, should be the opposite order.
			// Not an easy fix since we cant use a supported event. Would need some kind of special event that
			// gathers events to run after the switch and then runs them when the ability is no longer accessible.
			// (If you're tackling this, do note extreme weathers have the same issue)

			// Mark this pokemon's ability as ending so Pokemon#ignoringAbility skips it
			if (source.abilityState.ending) return;
			source.abilityState.ending = true;
			const sortedActive = this.getAllActive();
			this.speedSort(sortedActive);
			for (const pokemon of sortedActive) {
				if (pokemon !== source) {
					if (pokemon.getAbility().flags['cantsuppress']) continue; // does not interact with e.g Ice Face, Zen Mode
					if (pokemon.hasItem('abilityshield')) continue; // don't restart abilities that weren't suppressed

					// Will be suppressed by Pokemon#ignoringAbility if needed
					this.singleEvent('Start', pokemon.getAbility(), pokemon.abilityState, pokemon);
					if (pokemon.ability === "gluttony") {
						pokemon.abilityState.gluttony = false;
					}
				}
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, notransform: 1 },
		name: "Neutralizing Gas",
		rating: 3.5,
		num: 256,
	},
	noguard: {
		onAnyInvulnerabilityPriority: 1,
		onAnyInvulnerability(target, source, move) {
			if (move && (source === this.effectState.target || target === this.effectState.target)) return 0;
		},
		onAnyAccuracy(accuracy, target, source, move) {
			if (move && (source === this.effectState.target || target === this.effectState.target)) {
				return true;
			}
			return accuracy;
		},
		flags: {},
		name: "No Guard",
		rating: 4,
		num: 99,
	},
	normalize: {
		onModifyTypePriority: 1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'hiddenpower', 'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'struggle', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (!(move.isZ && move.category !== 'Status') && !noModifyType.includes(move.id) &&
				// TODO: Figure out actual interaction
				!(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Normal';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		flags: {},
		name: "Normalize",
		rating: 0,
		num: 96,
	},
	oblivious: {
		onUpdate(pokemon) {
			if (pokemon.volatiles['attract']) {
				this.add('-activate', pokemon, 'ability: Oblivious');
				pokemon.removeVolatile('attract');
				this.add('-end', pokemon, 'move: Attract', '[from] ability: Oblivious');
			}
			if (pokemon.volatiles['taunt']) {
				this.add('-activate', pokemon, 'ability: Oblivious');
				pokemon.removeVolatile('taunt');
				// Taunt's volatile already sends the -end message when removed
			}
		},
		onImmunity(type, pokemon) {
			if (type === 'attract') return false;
		},
		onTryHit(pokemon, target, move) {
			if (move.id === 'attract' || move.id === 'captivate' || move.id === 'taunt') {
				this.add('-immune', pokemon, '[from] ability: Oblivious');
				return null;
			}
		},
		onTryBoost(boost, target, source, effect) {
			if (effect.name === 'Intimidate' && boost.atk) {
				delete boost.atk;
				this.add('-fail', target, 'unboost', 'Attack', '[from] ability: Oblivious', `[of] ${target}`);
			}
		},
		flags: { breakable: 1 },
		name: "Oblivious",
		rating: 1.5,
		num: 12,
	},
	opportunist: {
		onFoeAfterBoost(boost, target, source, effect) {
			if (effect?.name === 'Opportunist' || effect?.name === 'Mirror Herb') return;
			if (!this.effectState.boosts) this.effectState.boosts = {} as SparseBoostsTable;
			const boostPlus = this.effectState.boosts;
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! > 0) {
					boostPlus[i] = (boostPlus[i] || 0) + boost[i]!;
				}
			}
		},
		onAnySwitchInPriority: -3,
		onAnySwitchIn() {
			if (!this.effectState.boosts) return;
			this.boost(this.effectState.boosts, this.effectState.target);
			delete this.effectState.boosts;
		},
		onAnyAfterMega() {
			if (!this.effectState.boosts) return;
			this.boost(this.effectState.boosts, this.effectState.target);
			delete this.effectState.boosts;
		},
		onAnyAfterTerastallization() {
			if (!this.effectState.boosts) return;
			this.boost(this.effectState.boosts, this.effectState.target);
			delete this.effectState.boosts;
		},
		onAnyAfterMove() {
			if (!this.effectState.boosts) return;
			this.boost(this.effectState.boosts, this.effectState.target);
			delete this.effectState.boosts;
		},
		onResidualOrder: 29,
		onResidual(pokemon) {
			if (!this.effectState.boosts) return;
			this.boost(this.effectState.boosts, this.effectState.target);
			delete this.effectState.boosts;
		},
		onEnd() {
			delete this.effectState.boosts;
		},
		flags: {},
		name: "Opportunist",
		rating: 3,
		num: 290,
	},
	orichalcumpulse: {
		onStart(pokemon) {
			if (this.field.setWeather('sunnyday')) {
				this.add('-activate', pokemon, 'Orichalcum Pulse', '[source]');
			} else if (this.field.isWeather('sunnyday')) {
				this.add('-activate', pokemon, 'ability: Orichalcum Pulse');
			}
		},
		onModifyAtkPriority: 5,
		onModifyAtk(atk, pokemon) {
			if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
				this.debug('Orichalcum boost');
				return this.chainModify([5461, 4096]);
			}
		},
		flags: {},
		name: "Orichalcum Pulse",
		rating: 4.5,
		num: 288,
	},
	overcoat: {
		onImmunity(type, pokemon) {
			if (type === 'sandstorm' || type === 'hail' || type === 'powder') return false;
		},
		onTryHitPriority: 1,
		onTryHit(target, source, move) {
			if (move.flags['powder'] && target !== source && this.dex.getImmunity('powder', target)) {
				this.add('-immune', target, '[from] ability: Overcoat');
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Overcoat",
		rating: 2,
		num: 142,
	},
	overgrow: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Grass' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Overgrow boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Grass' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Overgrow boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Overgrow",
		rating: 2,
		num: 65,
	},
	owntempo: {
		onUpdate(pokemon) {
			if (pokemon.volatiles['confusion']) {
				this.add('-activate', pokemon, 'ability: Own Tempo');
				pokemon.removeVolatile('confusion');
			}
		},
		onTryAddVolatile(status, pokemon) {
			if (status.id === 'confusion') return null;
		},
		onHit(target, source, move) {
			if (move?.volatileStatus === 'confusion') {
				this.add('-immune', target, 'confusion', '[from] ability: Own Tempo');
			}
		},
		onTryBoost(boost, target, source, effect) {
			if (effect.name === 'Intimidate' && boost.atk) {
				delete boost.atk;
				this.add('-fail', target, 'unboost', 'Attack', '[from] ability: Own Tempo', `[of] ${target}`);
			}
		},
		flags: { breakable: 1 },
		name: "Own Tempo",
		rating: 1.5,
		num: 20,
	},
	parentalbond: {
		onPrepareHit(source, target, move) {
			if (move.category === 'Status' || move.multihit || move.flags['noparentalbond'] || move.flags['charge'] ||
				move.flags['futuremove'] || move.spreadHit || move.isZ || move.isMax) return;
			move.multihit = 2;
			move.multihitType = 'parentalbond';
		},
		// Damage modifier implemented in BattleActions#modifyDamage()
		onSourceModifySecondaries(secondaries, target, source, move) {
			if (move.multihitType === 'parentalbond' && move.id === 'secretpower' && move.hit < 2) {
				// hack to prevent accidentally suppressing King's Rock/Razor Fang
				return secondaries.filter(effect => effect.volatileStatus === 'flinch');
			}
		},
		flags: {},
		name: "Parental Bond",
		rating: 4.5,
		num: 185,
	},
	pastelveil: {
		onStart(pokemon) {
			for (const ally of pokemon.alliesAndSelf()) {
				if (['psn', 'tox'].includes(ally.status)) {
					this.add('-activate', pokemon, 'ability: Pastel Veil');
					ally.cureStatus();
				}
			}
		},
		onUpdate(pokemon) {
			if (['psn', 'tox'].includes(pokemon.status)) {
				this.add('-activate', pokemon, 'ability: Pastel Veil');
				pokemon.cureStatus();
			}
		},
		onAnySwitchIn() {
			((this.effect as any).onStart as (p: Pokemon) => void).call(this, this.effectState.target);
		},
		onSetStatus(status, target, source, effect) {
			if (!['psn', 'tox'].includes(status.id)) return;
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Pastel Veil');
			}
			return false;
		},
		onAllySetStatus(status, target, source, effect) {
			if (!['psn', 'tox'].includes(status.id)) return;
			if ((effect as Move)?.status) {
				const effectHolder = this.effectState.target;
				this.add('-block', target, 'ability: Pastel Veil', `[of] ${effectHolder}`);
			}
			return false;
		},
		flags: { breakable: 1 },
		name: "Pastel Veil",
		rating: 2,
		num: 257,
	},
	perishbody: {
		onDamagingHit(damage, target, source, move) {
			if (!this.checkMoveMakesContact(move, source, target) || source.volatiles['perishsong']) return;
			this.add('-ability', target, 'Perish Body');
			source.addVolatile('perishsong');
			target.addVolatile('perishsong');
		},
		flags: {},
		name: "Perish Body",
		rating: 1,
		num: 253,
	},
	pickpocket: {
		onAfterMoveSecondary(target, source, move) {
			if (source && source !== target && move?.flags['contact']) {
				if (target.item || target.switchFlag || target.forceSwitchFlag || source.switchFlag === true) {
					return;
				}
				const yourItem = source.takeItem(target);
				if (!yourItem) {
					return;
				}
				if (!target.setItem(yourItem)) {
					source.item = yourItem.id;
					return;
				}
				this.add('-enditem', source, yourItem, '[silent]', '[from] ability: Pickpocket', `[of] ${source}`);
				this.add('-item', target, yourItem, '[from] ability: Pickpocket', `[of] ${source}`);
			}
		},
		flags: {},
		name: "Pickpocket",
		rating: 1,
		num: 124,
	},
	pickup: {
		onResidualOrder: 28,
		onResidualSubOrder: 2,
		onResidual(pokemon) {
			if (pokemon.item) return;
			const pickupTargets = this.getAllActive().filter(target => (
				target.lastItem && target.usedItemThisTurn && pokemon.isAdjacent(target)
			));
			if (!pickupTargets.length) return;
			const randomTarget = this.sample(pickupTargets);
			const item = randomTarget.lastItem;
			randomTarget.lastItem = '';
			this.add('-item', pokemon, this.dex.items.get(item), '[from] ability: Pickup');
			pokemon.setItem(item);
		},
		flags: {},
		name: "Pickup",
		rating: 0.5,
		num: 53,
	},
	pixilate: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status') && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Fairy';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		flags: {},
		name: "Pixilate",
		rating: 4,
		num: 182,
	},
	plus: {
		onModifySpAPriority: 5,
		onModifySpA(spa, pokemon) {
			for (const allyActive of pokemon.allies()) {
				if (allyActive.hasAbility(['minus', 'plus'])) {
					return this.chainModify(1.5);
				}
			}
		},
		flags: {},
		name: "Plus",
		rating: 0,
		num: 57,
	},
	poisonheal: {
		onDamagePriority: 1,
		onDamage(damage, target, source, effect) {
			if (effect.id === 'psn' || effect.id === 'tox') {
				this.heal(target.baseMaxhp / 8);
				return false;
			}
		},
		flags: {},
		name: "Poison Heal",
		rating: 4,
		num: 90,
	},
	poisonpoint: {
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target)) {
				if (this.randomChance(3, 10)) {
					source.trySetStatus('psn', target);
				}
			}
		},
		flags: {},
		name: "Poison Point",
		rating: 1.5,
		num: 38,
	},
	poisonpuppeteer: {
		onAnyAfterSetStatus(status, target, source, effect) {
			if (source.baseSpecies.name !== "Pecharunt") return;
			if (source !== this.effectState.target || target === source || effect.effectType !== 'Move') return;
			if (status.id === 'psn' || status.id === 'tox') {
				target.addVolatile('confusion');
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1 },
		name: "Poison Puppeteer",
		rating: 3,
		num: 310,
	},
	poisontouch: {
		onSourceDamagingHit(damage, target, source, move) {
			// Despite not being a secondary, Shield Dust / Covert Cloak block Poison Touch's effect
			if (target.hasAbility('shielddust') || target.hasItem('covertcloak')) return;
			if (this.checkMoveMakesContact(move, target, source)) {
				if (this.randomChance(3, 10)) {
					target.trySetStatus('psn', source);
				}
			}
		},
		flags: {},
		name: "Poison Touch",
		rating: 2,
		num: 143,
	},
	powerconstruct: {
		onResidualOrder: 29,
		onResidual(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Zygarde' || pokemon.transformed || !pokemon.hp) return;
			if (pokemon.species.id === 'zygardecomplete' || pokemon.hp > pokemon.maxhp / 2) return;
			this.add('-activate', pokemon, 'ability: Power Construct');
			pokemon.formeChange('Zygarde-Complete', this.effect, true);
			pokemon.formeRegression = true;
			pokemon.baseMaxhp = Math.floor(Math.floor(
				2 * pokemon.species.baseStats['hp'] + pokemon.set.ivs['hp'] + Math.floor(pokemon.set.evs['hp'] / 4) + 100
			) * pokemon.level / 100 + 10);
			const newMaxHP = pokemon.volatiles['dynamax'] ? (2 * pokemon.baseMaxhp) : pokemon.baseMaxhp;
			pokemon.hp = newMaxHP - (pokemon.maxhp - pokemon.hp);
			pokemon.maxhp = newMaxHP;
			this.add('-heal', pokemon, pokemon.getHealth, '[silent]');
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Power Construct",
		rating: 5,
		num: 211,
	},
	powerofalchemy: {
		onAllyFaint(target) {
			if (!this.effectState.target.hp) return;
			const ability = target.getAbility();
			if (ability.flags['noreceiver'] || ability.id === 'noability') return;
			if (this.effectState.target.setAbility(ability)) {
				this.add('-ability', this.effectState.target, ability, '[from] ability: Power of Alchemy', `[of] ${target}`);
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1 },
		name: "Power of Alchemy",
		rating: 0,
		num: 223,
	},
	powerspot: {
		onAllyBasePowerPriority: 22,
		onAllyBasePower(basePower, attacker, defender, move) {
			if (attacker !== this.effectState.target) {
				this.debug('Power Spot boost');
				return this.chainModify([5325, 4096]);
			}
		},
		flags: {},
		name: "Power Spot",
		rating: 0,
		num: 249,
	},
	prankster: {
		onModifyPriority(priority, pokemon, target, move) {
			if (move?.category === 'Status') {
				move.pranksterBoosted = true;
				return priority + 1;
			}
		},
		flags: {},
		name: "Prankster",
		rating: 4,
		num: 158,
	},
	pressure: {
		onStart(pokemon) {
			this.add('-ability', pokemon, 'Pressure');
		},
		onDeductPP(target, source) {
			if (target.isAlly(source)) return;
			return 1;
		},
		flags: {},
		name: "Pressure",
		rating: 2.5,
		num: 46,
	},
	primordialsea: {
		onStart(source) {
			this.field.setWeather('primordialsea');
		},
		onAnySetWeather(target, source, weather) {
			const strongWeathers = ['desolateland', 'primordialsea', 'deltastream'];
			if (this.field.getWeather().id === 'primordialsea' && !strongWeathers.includes(weather.id)) return false;
		},
		onEnd(pokemon) {
			if (this.field.weatherState.source !== pokemon) return;
			for (const target of this.getAllActive()) {
				if (target === pokemon) continue;
				if (target.hasAbility('primordialsea')) {
					this.field.weatherState.source = target;
					return;
				}
			}
			this.field.clearWeather();
		},
		flags: {},
		name: "Primordial Sea",
		rating: 4.5,
		num: 189,
	},
	prismarmor: {
		onSourceModifyDamage(damage, source, target, move) {
			if (target.getMoveHitData(move).typeMod > 0) {
				this.debug('Prism Armor neutralize');
				return this.chainModify(0.75);
			}
		},
		flags: {},
		name: "Prism Armor",
		rating: 3,
		num: 232,
	},
	propellertail: {
		onModifyMovePriority: 1,
		onModifyMove(move) {
			// most of the implementation is in Battle#getTarget
			move.tracksTarget = move.target !== 'scripted';
		},
		flags: {},
		name: "Propeller Tail",
		rating: 0,
		num: 239,
	},
	protean: {
		onPrepareHit(source, target, move) {
			if (this.effectState.protean === source.previouslySwitchedIn) return;
			if (move.hasBounced || move.flags['futuremove'] || move.sourceEffect === 'snatch' || move.callsMove) return;
			const type = move.type;
			if (type && type !== '???' && source.getTypes().join() !== type) {
				if (!source.setType(type)) return;
				this.effectState.protean = source.previouslySwitchedIn;
				this.add('-start', source, 'typechange', type, '[from] ability: Protean');
			}
		},
		flags: {},
		name: "Protean",
		rating: 4,
		num: 168,
	},
	protosynthesis: {
		onSwitchInPriority: -2,
		onStart(pokemon) {
			this.singleEvent('WeatherChange', this.effect, this.effectState, pokemon);
		},
		onWeatherChange(pokemon) {
			// Protosynthesis is not affected by Utility Umbrella
			if (this.field.isWeather('sunnyday')) {
				pokemon.addVolatile('protosynthesis');
			} else if (!pokemon.volatiles['protosynthesis']?.fromBooster && !this.field.isWeather('sunnyday')) {
				pokemon.removeVolatile('protosynthesis');
			}
		},
		onEnd(pokemon) {
			delete pokemon.volatiles['protosynthesis'];
			this.add('-end', pokemon, 'Protosynthesis', '[silent]');
		},
		condition: {
			noCopy: true,
			onStart(pokemon, source, effect) {
				if (effect?.name === 'Booster Energy') {
					this.effectState.fromBooster = true;
					this.add('-activate', pokemon, 'ability: Protosynthesis', '[fromitem]');
				} else {
					this.add('-activate', pokemon, 'ability: Protosynthesis');
				}
				this.effectState.bestStat = pokemon.getBestStat(false, true);
				this.add('-start', pokemon, 'protosynthesis' + this.effectState.bestStat);
			},
			onModifyAtkPriority: 5,
			onModifyAtk(atk, pokemon) {
				if (this.effectState.bestStat !== 'atk' || pokemon.ignoringAbility()) return;
				this.debug('Protosynthesis atk boost');
				return this.chainModify([5325, 4096]);
			},
			onModifyDefPriority: 6,
			onModifyDef(def, pokemon) {
				if (this.effectState.bestStat !== 'def' || pokemon.ignoringAbility()) return;
				this.debug('Protosynthesis def boost');
				return this.chainModify([5325, 4096]);
			},
			onModifySpAPriority: 5,
			onModifySpA(spa, pokemon) {
				if (this.effectState.bestStat !== 'spa' || pokemon.ignoringAbility()) return;
				this.debug('Protosynthesis spa boost');
				return this.chainModify([5325, 4096]);
			},
			onModifySpDPriority: 6,
			onModifySpD(spd, pokemon) {
				if (this.effectState.bestStat !== 'spd' || pokemon.ignoringAbility()) return;
				this.debug('Protosynthesis spd boost');
				return this.chainModify([5325, 4096]);
			},
			onModifySpe(spe, pokemon) {
				if (this.effectState.bestStat !== 'spe' || pokemon.ignoringAbility()) return;
				this.debug('Protosynthesis spe boost');
				return this.chainModify(1.5);
			},
			onEnd(pokemon) {
				this.add('-end', pokemon, 'Protosynthesis');
			},
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, notransform: 1 },
		name: "Protosynthesis",
		rating: 3,
		num: 281,
	},
	psychicsurge: {
		onStart(source) {
			this.field.setTerrain('psychicterrain');
		},
		flags: {},
		name: "Psychic Surge",
		rating: 4,
		num: 227,
	},
	punkrock: {
		onBasePowerPriority: 7,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['sound']) {
				this.debug('Punk Rock boost');
				return this.chainModify([5325, 4096]);
			}
		},
		onSourceModifyDamage(damage, source, target, move) {
			if (move.flags['sound']) {
				this.debug('Punk Rock weaken');
				return this.chainModify(0.5);
			}
		},
		flags: { breakable: 1 },
		name: "Punk Rock",
		rating: 3.5,
		num: 244,
	},
	purepower: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk) {
			return this.chainModify(2);
		},
		flags: {},
		name: "Pure Power",
		rating: 5,
		num: 74,
	},
	purifyingsalt: {
		onSetStatus(status, target, source, effect) {
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Purifying Salt');
			}
			return false;
		},
		onTryAddVolatile(status, target) {
			if (status.id === 'yawn') {
				this.add('-immune', target, '[from] ability: Purifying Salt');
				return null;
			}
		},
		onSourceModifyAtkPriority: 6,
		onSourceModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Ghost') {
				this.debug('Purifying Salt weaken');
				return this.chainModify(0.5);
			}
		},
		onSourceModifySpAPriority: 5,
		onSourceModifySpA(spa, attacker, defender, move) {
			if (move.type === 'Ghost') {
				this.debug('Purifying Salt weaken');
				return this.chainModify(0.5);
			}
		},
		flags: { breakable: 1 },
		name: "Purifying Salt",
		rating: 4,
		num: 272,
	},
	quarkdrive: {
		onSwitchInPriority: -2,
		onStart(pokemon) {
			this.singleEvent('TerrainChange', this.effect, this.effectState, pokemon);
		},
		onTerrainChange(pokemon) {
			if (this.field.isTerrain('electricterrain')) {
				pokemon.addVolatile('quarkdrive');
			} else if (!pokemon.volatiles['quarkdrive']?.fromBooster) {
				pokemon.removeVolatile('quarkdrive');
			}
		},
		onEnd(pokemon) {
			delete pokemon.volatiles['quarkdrive'];
			this.add('-end', pokemon, 'Quark Drive', '[silent]');
		},
		condition: {
			noCopy: true,
			onStart(pokemon, source, effect) {
				if (effect?.name === 'Booster Energy') {
					this.effectState.fromBooster = true;
					this.add('-activate', pokemon, 'ability: Quark Drive', '[fromitem]');
				} else {
					this.add('-activate', pokemon, 'ability: Quark Drive');
				}
				this.effectState.bestStat = pokemon.getBestStat(false, true);
				this.add('-start', pokemon, 'quarkdrive' + this.effectState.bestStat);
			},
			onModifyAtkPriority: 5,
			onModifyAtk(atk, pokemon) {
				if (this.effectState.bestStat !== 'atk' || pokemon.ignoringAbility()) return;
				this.debug('Quark Drive atk boost');
				return this.chainModify([5325, 4096]);
			},
			onModifyDefPriority: 6,
			onModifyDef(def, pokemon) {
				if (this.effectState.bestStat !== 'def' || pokemon.ignoringAbility()) return;
				this.debug('Quark Drive def boost');
				return this.chainModify([5325, 4096]);
			},
			onModifySpAPriority: 5,
			onModifySpA(spa, pokemon) {
				if (this.effectState.bestStat !== 'spa' || pokemon.ignoringAbility()) return;
				this.debug('Quark Drive spa boost');
				return this.chainModify([5325, 4096]);
			},
			onModifySpDPriority: 6,
			onModifySpD(spd, pokemon) {
				if (this.effectState.bestStat !== 'spd' || pokemon.ignoringAbility()) return;
				this.debug('Quark Drive spd boost');
				return this.chainModify([5325, 4096]);
			},
			onModifySpe(spe, pokemon) {
				if (this.effectState.bestStat !== 'spe' || pokemon.ignoringAbility()) return;
				this.debug('Quark Drive spe boost');
				return this.chainModify(1.5);
			},
			onEnd(pokemon) {
				this.add('-end', pokemon, 'Quark Drive');
			},
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, notransform: 1 },
		name: "Quark Drive",
		rating: 3,
		num: 282,
	},
	queenlymajesty: {
		onFoeTryMove(target, source, move) {
			const targetAllExceptions = ['perishsong', 'flowershield', 'rototiller'];
			if (move.target === 'foeSide' || (move.target === 'all' && !targetAllExceptions.includes(move.id))) {
				return;
			}

			const dazzlingHolder = this.effectState.target;
			if ((source.isAlly(dazzlingHolder) || move.target === 'all') && move.priority > 0.1) {
				this.attrLastMove('[still]');
				this.add('cant', dazzlingHolder, 'ability: Queenly Majesty', move, `[of] ${target}`);
				return false;
			}
		},
		flags: { breakable: 1 },
		name: "Queenly Majesty",
		rating: 2.5,
		num: 214,
	},
	quickdraw: {
		onFractionalPriorityPriority: -1,
		onFractionalPriority(priority, pokemon, target, move) {
			if (move.category !== "Status" && this.randomChance(3, 10)) {
				this.add('-activate', pokemon, 'ability: Quick Draw');
				return 0.1;
			}
		},
		flags: {},
		name: "Quick Draw",
		rating: 2.5,
		num: 259,
	},
	quickfeet: {
		onModifySpe(spe, pokemon) {
			if (pokemon.status) {
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Quick Feet",
		rating: 2.5,
		num: 95,
	},
	raindish: {
		onWeather(target, source, effect) {
			if (target.hasItem('utilityumbrella')) return;
			if (effect.id === 'raindance' || effect.id === 'primordialsea') {
				this.heal(target.baseMaxhp / 16);
			}
		},
		flags: {},
		name: "Rain Dish",
		rating: 1.5,
		num: 44,
	},
	rattled: {
		onDamagingHit(damage, target, source, move) {
			if (['Dark', 'Bug', 'Ghost'].includes(move.type)) {
				this.boost({ spe: 1 });
			}
		},
		onAfterBoost(boost, target, source, effect) {
			if (effect?.name === 'Intimidate' && boost.atk) {
				this.boost({ spe: 1 });
			}
		},
		flags: {},
		name: "Rattled",
		rating: 1,
		num: 155,
	},
	receiver: {
		onAllyFaint(target) {
			if (!this.effectState.target.hp) return;
			const ability = target.getAbility();
			if (ability.flags['noreceiver'] || ability.id === 'noability') return;
			if (this.effectState.target.setAbility(ability)) {
				this.add('-ability', this.effectState.target, ability, '[from] ability: Receiver', `[of] ${target}`);
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1 },
		name: "Receiver",
		rating: 0,
		num: 222,
	},
	reckless: {
		onBasePowerPriority: 23,
		onBasePower(basePower, attacker, defender, move) {
			if (move.recoil || move.hasCrashDamage) {
				this.debug('Reckless boost');
				return this.chainModify([4915, 4096]);
			}
		},
		flags: {},
		name: "Reckless",
		rating: 3,
		num: 120,
	},
	refrigerate: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status') && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Ice';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		flags: {},
		name: "Refrigerate",
		rating: 4,
		num: 174,
	},
	regenerator: {
		onSwitchOut(pokemon) {
			pokemon.heal(pokemon.baseMaxhp / 3);
		},
		flags: {},
		name: "Regenerator",
		rating: 4.5,
		num: 144,
	},
	ripen: {
		onTryHeal(damage, target, source, effect) {
			if (!effect) return;
			if (effect.name === 'Berry Juice' || effect.name === 'Leftovers') {
				this.add('-activate', target, 'ability: Ripen');
			}
			if ((effect as Item).isBerry) return this.chainModify(2);
		},
		onChangeBoost(boost, target, source, effect) {
			if (effect && (effect as Item).isBerry) {
				let b: BoostID;
				for (b in boost) {
					boost[b]! *= 2;
				}
			}
		},
		onSourceModifyDamagePriority: -1,
		onSourceModifyDamage(damage, source, target, move) {
			if (target.abilityState.berryWeaken) {
				target.abilityState.berryWeaken = false;
				return this.chainModify(0.5);
			}
		},
		onTryEatItemPriority: -1,
		onTryEatItem(item, pokemon) {
			this.add('-activate', pokemon, 'ability: Ripen');
		},
		onEatItem(item, pokemon) {
			const weakenBerries = [
				'Babiri Berry', 'Charti Berry', 'Chilan Berry', 'Chople Berry', 'Coba Berry', 'Colbur Berry', 'Haban Berry', 'Kasib Berry', 'Kebia Berry', 'Occa Berry', 'Passho Berry', 'Payapa Berry', 'Rindo Berry', 'Roseli Berry', 'Shuca Berry', 'Tanga Berry', 'Wacan Berry', 'Yache Berry',
			];
			// Record if the pokemon ate a berry to resist the attack
			pokemon.abilityState.berryWeaken = weakenBerries.includes(item.name);
		},
		flags: {},
		name: "Ripen",
		rating: 2,
		num: 247,
	},
	rivalry: {
		onBasePowerPriority: 24,
		onBasePower(basePower, attacker, defender, move) {
			if (attacker.gender && defender.gender) {
				if (attacker.gender === defender.gender) {
					this.debug('Rivalry boost');
					return this.chainModify(1.25);
				} else {
					this.debug('Rivalry weaken');
					return this.chainModify(0.75);
				}
			}
		},
		flags: {},
		name: "Rivalry",
		rating: 0,
		num: 79,
	},
	rkssystem: {
		// RKS System's type-changing itself is implemented in statuses.js
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "RKS System",
		rating: 4,
		num: 225,
	},
	rockhead: {
		onDamage(damage, target, source, effect) {
			if (effect.id === 'recoil') {
				if (!this.activeMove) throw new Error("Battle.activeMove is null");
				if (this.activeMove.id !== 'struggle') return null;
			}
		},
		flags: {},
		name: "Rock Head",
		rating: 3,
		num: 69,
	},
	rockypayload: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Rock') {
				this.debug('Rocky Payload boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Rock') {
				this.debug('Rocky Payload boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Rocky Payload",
		rating: 3.5,
		num: 276,
	},
	roughskin: {
		onDamagingHitOrder: 1,
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target, true)) {
				this.damage(source.baseMaxhp / 8, source, target);
			}
		},
		flags: {},
		name: "Rough Skin",
		rating: 2.5,
		num: 24,
	},
	runaway: {
		flags: {},
		name: "Run Away",
		rating: 0,
		num: 50,
	},
	sandforce: {
		onBasePowerPriority: 21,
		onBasePower(basePower, attacker, defender, move) {
			if (this.field.isWeather('sandstorm')) {
				if (move.type === 'Rock' || move.type === 'Ground' || move.type === 'Steel') {
					this.debug('Sand Force boost');
					return this.chainModify([5325, 4096]);
				}
			}
		},
		onImmunity(type, pokemon) {
			if (type === 'sandstorm') return false;
		},
		flags: {},
		name: "Sand Force",
		rating: 2,
		num: 159,
	},
	sandrush: {
		onModifySpe(spe, pokemon) {
			if (this.field.isWeather('sandstorm')) {
				return this.chainModify(2);
			}
		},
		onImmunity(type, pokemon) {
			if (type === 'sandstorm') return false;
		},
		flags: {},
		name: "Sand Rush",
		rating: 3,
		num: 146,
	},
	sandspit: {
		onDamagingHit(damage, target, source, move) {
			this.field.setWeather('sandstorm');
		},
		flags: {},
		name: "Sand Spit",
		rating: 1,
		num: 245,
	},
	sandstream: {
		onStart(source) {
			this.field.setWeather('sandstorm');
		},
		flags: {},
		name: "Sand Stream",
		rating: 4,
		num: 45,
	},
	sandveil: {
		onImmunity(type, pokemon) {
			if (type === 'sandstorm') return false;
		},
		onModifyAccuracyPriority: -1,
		onModifyAccuracy(accuracy) {
			if (typeof accuracy !== 'number') return;
			if (this.field.isWeather('sandstorm')) {
				this.debug('Sand Veil - decreasing accuracy');
				return this.chainModify([3277, 4096]);
			}
		},
		flags: { breakable: 1 },
		name: "Sand Veil",
		rating: 1.5,
		num: 8,
	},
	sapsipper: {
		onTryHitPriority: 1,
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Grass') {
				if (!this.boost({ atk: 1 })) {
					this.add('-immune', target, '[from] ability: Sap Sipper');
				}
				return null;
			}
		},
		onAllyTryHitSide(target, source, move) {
			if (source === this.effectState.target || !target.isAlly(source)) return;
			if (move.type === 'Grass') {
				this.boost({ atk: 1 }, this.effectState.target);
			}
		},
		flags: { breakable: 1 },
		name: "Sap Sipper",
		rating: 3,
		num: 157,
	},
	schooling: {
		onSwitchInPriority: -1,
		onStart(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Wishiwashi' || pokemon.level < 20 || pokemon.transformed) return;
			if (pokemon.hp > pokemon.maxhp / 4) {
				if (pokemon.species.id === 'wishiwashi') {
					pokemon.formeChange('Wishiwashi-School');
				}
			} else {
				if (pokemon.species.id === 'wishiwashischool') {
					pokemon.formeChange('Wishiwashi');
				}
			}
		},
		onResidualOrder: 29,
		onResidual(pokemon) {
			if (
				pokemon.baseSpecies.baseSpecies !== 'Wishiwashi' || pokemon.level < 20 ||
				pokemon.transformed || !pokemon.hp
			) return;
			if (pokemon.hp > pokemon.maxhp / 4) {
				if (pokemon.species.id === 'wishiwashi') {
					pokemon.formeChange('Wishiwashi-School');
				}
			} else {
				if (pokemon.species.id === 'wishiwashischool') {
					pokemon.formeChange('Wishiwashi');
				}
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Schooling",
		rating: 3,
		num: 208,
	},
	scrappy: {
		onModifyMovePriority: -5,
		onModifyMove(move) {
			if (!move.ignoreImmunity) move.ignoreImmunity = {};
			if (move.ignoreImmunity !== true) {
				move.ignoreImmunity['Fighting'] = true;
				move.ignoreImmunity['Normal'] = true;
			}
		},
		onTryBoost(boost, target, source, effect) {
			if (effect.name === 'Intimidate' && boost.atk) {
				delete boost.atk;
				this.add('-fail', target, 'unboost', 'Attack', '[from] ability: Scrappy', `[of] ${target}`);
			}
		},
		flags: {},
		name: "Scrappy",
		rating: 3,
		num: 113,
	},
	screencleaner: {
		onStart(pokemon) {
			let activated = false;
			for (const sideCondition of ['reflect', 'lightscreen', 'auroraveil']) {
				for (const side of [pokemon.side, ...pokemon.side.foeSidesWithConditions()]) {
					if (side.getSideCondition(sideCondition)) {
						if (!activated) {
							this.add('-activate', pokemon, 'ability: Screen Cleaner');
							activated = true;
						}
						side.removeSideCondition(sideCondition);
					}
				}
			}
		},
		flags: {},
		name: "Screen Cleaner",
		rating: 2,
		num: 251,
	},
	seedsower: {
		onDamagingHit(damage, target, source, move) {
			this.field.setTerrain('grassyterrain');
		},
		flags: {},
		name: "Seed Sower",
		rating: 2.5,
		num: 269,
	},
	serenegrace: {
		onModifyMovePriority: -2,
		onModifyMove(move) {
			if (move.secondaries) {
				this.debug('doubling secondary chance');
				for (const secondary of move.secondaries) {
					if (secondary.chance) secondary.chance *= 2;
				}
			}
			if (move.self?.chance) move.self.chance *= 2;
		},
		flags: {},
		name: "Serene Grace",
		rating: 3.5,
		num: 32,
	},
	shadowshield: {
		onSourceModifyDamage(damage, source, target, move) {
			if (target.hp >= target.maxhp) {
				this.debug('Shadow Shield weaken');
				return this.chainModify(0.5);
			}
		},
		flags: {},
		name: "Shadow Shield",
		rating: 3.5,
		num: 231,
	},
	shadowtag: {
		onFoeTrapPokemon(pokemon) {
			if (!pokemon.hasAbility('shadowtag') && pokemon.isAdjacent(this.effectState.target)) {
				pokemon.tryTrap(true);
			}
		},
		onFoeMaybeTrapPokemon(pokemon, source) {
			if (!source) source = this.effectState.target;
			if (!source || !pokemon.isAdjacent(source)) return;
			if (!pokemon.hasAbility('shadowtag')) {
				pokemon.maybeTrapped = true;
			}
		},
		flags: {},
		name: "Shadow Tag",
		rating: 5,
		num: 23,
	},
	sharpness: {
		onBasePowerPriority: 19,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['slicing']) {
				this.debug('Sharpness boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Sharpness",
		rating: 3.5,
		num: 292,
	},
	shedskin: {
		onResidualOrder: 5,
		onResidualSubOrder: 3,
		onResidual(pokemon) {
			if (pokemon.hp && pokemon.status && this.randomChance(33, 100)) {
				this.debug('shed skin');
				this.add('-activate', pokemon, 'ability: Shed Skin');
				pokemon.cureStatus();
			}
		},
		flags: {},
		name: "Shed Skin",
		rating: 3,
		num: 61,
	},
	sheerforce: {
		onModifyMove(move, pokemon) {
			if (move.secondaries) {
				delete move.secondaries;
				// Technically not a secondary effect, but it is negated
				delete move.self;
				if (move.id === 'clangoroussoulblaze') delete move.selfBoost;
				// Actual negation of `AfterMoveSecondary` effects implemented in scripts.js
				move.hasSheerForce = true;
			}
		},
		onBasePowerPriority: 21,
		onBasePower(basePower, pokemon, target, move) {
			if (move.hasSheerForce) return this.chainModify([5325, 4096]);
		},
		flags: {},
		name: "Sheer Force",
		rating: 3.5,
		num: 125,
	},
	shellarmor: {
		onCriticalHit: false,
		flags: { breakable: 1 },
		name: "Shell Armor",
		rating: 1,
		num: 75,
	},
	shielddust: {
		onModifySecondaries(secondaries) {
			this.debug('Shield Dust prevent secondary');
			return secondaries.filter(effect => !!effect.self);
		},
		flags: { breakable: 1 },
		name: "Shield Dust",
		rating: 2,
		num: 19,
	},
	shieldsdown: {
		onSwitchInPriority: -1,
		onStart(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Minior' || pokemon.transformed) return;
			if (pokemon.hp > pokemon.maxhp / 2) {
				if (pokemon.species.forme !== 'Meteor') {
					pokemon.formeChange('Minior-Meteor');
				}
			} else {
				if (pokemon.species.forme === 'Meteor') {
					pokemon.formeChange(pokemon.set.species);
				}
			}
		},
		onResidualOrder: 29,
		onResidual(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Minior' || pokemon.transformed || !pokemon.hp) return;
			if (pokemon.hp > pokemon.maxhp / 2) {
				if (pokemon.species.forme !== 'Meteor') {
					pokemon.formeChange('Minior-Meteor');
				}
			} else {
				if (pokemon.species.forme === 'Meteor') {
					pokemon.formeChange(pokemon.set.species);
				}
			}
		},
		onSetStatus(status, target, source, effect) {
			if (target.species.id !== 'miniormeteor' || target.transformed) return;
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Shields Down');
			}
			return false;
		},
		onTryAddVolatile(status, target) {
			if (target.species.id !== 'miniormeteor' || target.transformed) return;
			if (status.id !== 'yawn') return;
			this.add('-immune', target, '[from] ability: Shields Down');
			return null;
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Shields Down",
		rating: 3,
		num: 197,
	},
	simple: {
		onChangeBoost(boost, target, source, effect) {
			if (effect && effect.id === 'zpower') return;
			let i: BoostID;
			for (i in boost) {
				boost[i]! *= 2;
			}
		},
		flags: { breakable: 1 },
		name: "Simple",
		rating: 4,
		num: 86,
	},
	skilllink: {
		onModifyMove(move) {
			if (move.multihit && Array.isArray(move.multihit) && move.multihit.length) {
				move.multihit = move.multihit[1];
			}
			if (move.multiaccuracy) {
				delete move.multiaccuracy;
			}
		},
		flags: {},
		name: "Skill Link",
		rating: 3,
		num: 92,
	},
	slowstart: {
		onStart(pokemon) {
			pokemon.addVolatile('slowstart');
		},
		onEnd(pokemon) {
			delete pokemon.volatiles['slowstart'];
			this.add('-end', pokemon, 'Slow Start', '[silent]');
		},
		condition: {
			duration: 5,
			onResidualOrder: 28,
			onResidualSubOrder: 2,
			onStart(target) {
				this.add('-start', target, 'ability: Slow Start');
			},
			onResidual(pokemon) {
				if (!pokemon.activeTurns) {
					this.effectState.duration! += 1;
				}
			},
			onModifyAtkPriority: 5,
			onModifyAtk(atk, pokemon) {
				return this.chainModify(0.5);
			},
			onModifySpe(spe, pokemon) {
				return this.chainModify(0.5);
			},
			onEnd(target) {
				this.add('-end', target, 'Slow Start');
			},
		},
		flags: {},
		name: "Slow Start",
		rating: -1,
		num: 112,
	},
	slushrush: {
		onModifySpe(spe, pokemon) {
			if (this.field.isWeather(['hail', 'snowscape'])) {
				return this.chainModify(2);
			}
		},
		flags: {},
		name: "Slush Rush",
		rating: 3,
		num: 202,
	},
	sniper: {
		onModifyDamage(damage, source, target, move) {
			if (target.getMoveHitData(move).crit) {
				this.debug('Sniper boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Sniper",
		rating: 2,
		num: 97,
	},
	snowcloak: {
		onImmunity(type, pokemon) {
			if (type === 'hail') return false;
		},
		onModifyAccuracyPriority: -1,
		onModifyAccuracy(accuracy) {
			if (typeof accuracy !== 'number') return;
			if (this.field.isWeather(['hail', 'snowscape'])) {
				this.debug('Snow Cloak - decreasing accuracy');
				return this.chainModify([3277, 4096]);
			}
		},
		flags: { breakable: 1 },
		name: "Snow Cloak",
		rating: 1.5,
		num: 81,
	},
	snowwarning: {
		onStart(source) {
			this.field.setWeather('snowscape');
		},
		flags: {},
		name: "Snow Warning",
		rating: 4,
		num: 117,
	},
	solarpower: {
		onModifySpAPriority: 5,
		onModifySpA(spa, pokemon) {
			if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(1.5);
			}
		},
		onWeather(target, source, effect) {
			if (target.hasItem('utilityumbrella')) return;
			if (effect.id === 'sunnyday' || effect.id === 'desolateland') {
				this.damage(target.baseMaxhp / 8, target, target);
			}
		},
		flags: {},
		name: "Solar Power",
		rating: 2,
		num: 94,
	},
	solidrock: {
		onSourceModifyDamage(damage, source, target, move) {
			if (target.getMoveHitData(move).typeMod > 0) {
				this.debug('Solid Rock neutralize');
				return this.chainModify(0.75);
			}
		},
		flags: { breakable: 1 },
		name: "Solid Rock",
		rating: 3,
		num: 116,
	},
	soulheart: {
		onAnyFaintPriority: 1,
		onAnyFaint() {
			this.boost({ spa: 1 }, this.effectState.target);
		},
		flags: {},
		name: "Soul-Heart",
		rating: 3.5,
		num: 220,
	},
	soundproof: {
		onTryHit(target, source, move) {
			if (target !== source && move.flags['sound']) {
				this.add('-immune', target, '[from] ability: Soundproof');
				return null;
			}
		},
		onAllyTryHitSide(target, source, move) {
			if (move.flags['sound']) {
				this.add('-immune', this.effectState.target, '[from] ability: Soundproof');
			}
		},
		flags: { breakable: 1 },
		name: "Soundproof",
		rating: 2,
		num: 43,
	},
	speedboost: {
		onResidualOrder: 28,
		onResidualSubOrder: 2,
		onResidual(pokemon) {
			if (pokemon.activeTurns) {
				this.boost({ spe: 1 });
			}
		},
		flags: {},
		name: "Speed Boost",
		rating: 4.5,
		num: 3,
	},
	stakeout: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender) {
			if (!defender.activeTurns) {
				this.debug('Stakeout boost');
				return this.chainModify(2);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender) {
			if (!defender.activeTurns) {
				this.debug('Stakeout boost');
				return this.chainModify(2);
			}
		},
		flags: {},
		name: "Stakeout",
		rating: 4.5,
		num: 198,
	},
	stall: {
		onFractionalPriority: -0.1,
		flags: {},
		name: "Stall",
		rating: -1,
		num: 100,
	},
	stalwart: {
		onModifyMovePriority: 1,
		onModifyMove(move) {
			// most of the implementation is in Battle#getTarget
			move.tracksTarget = move.target !== 'scripted';
		},
		flags: {},
		name: "Stalwart",
		rating: 0,
		num: 242,
	},
	stamina: {
		onDamagingHit(damage, target, source, effect) {
			this.boost({ def: 1 });
		},
		flags: {},
		name: "Stamina",
		rating: 4,
		num: 192,
	},
	stancechange: {
		onModifyMovePriority: 1,
		onModifyMove(move, attacker, defender) {
			if (attacker.species.baseSpecies !== 'Aegislash' || attacker.transformed) return;
			if (move.category === 'Status' && move.id !== 'kingsshield') return;
			const targetForme = (move.id === 'kingsshield' ? 'Aegislash' : 'Aegislash-Blade');
			if (attacker.species.name !== targetForme) attacker.formeChange(targetForme);
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Stance Change",
		rating: 4,
		num: 176,
	},
	static: {
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target)) {
				if (this.randomChance(3, 10)) {
					source.trySetStatus('par', target);
				}
			}
		},
		flags: {},
		name: "Static",
		rating: 2,
		num: 9,
	},
	steadfast: {
		onFlinch(pokemon) {
			this.boost({ spe: 1 });
		},
		flags: {},
		name: "Steadfast",
		rating: 1,
		num: 80,
	},
	steamengine: {
		onDamagingHit(damage, target, source, move) {
			if (['Water', 'Fire'].includes(move.type)) {
				this.boost({ spe: 6 });
			}
		},
		flags: {},
		name: "Steam Engine",
		rating: 2,
		num: 243,
	},
	steelworker: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Steel') {
				this.debug('Steelworker boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Steel') {
				this.debug('Steelworker boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Steelworker",
		rating: 3.5,
		num: 200,
	},
	steelyspirit: {
		onAllyBasePowerPriority: 22,
		onAllyBasePower(basePower, attacker, defender, move) {
			if (move.type === 'Steel') {
				this.debug('Steely Spirit boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Steely Spirit",
		rating: 3.5,
		num: 252,
	},
	stench: {
		onModifyMovePriority: -1,
		onModifyMove(move) {
			if (move.category !== "Status") {
				this.debug('Adding Stench flinch');
				if (!move.secondaries) move.secondaries = [];
				for (const secondary of move.secondaries) {
					if (secondary.volatileStatus === 'flinch') return;
				}
				move.secondaries.push({
					chance: 10,
					volatileStatus: 'flinch',
				});
			}
		},
		flags: {},
		name: "Stench",
		rating: 0.5,
		num: 1,
	},
	stickyhold: {
		onTakeItem(item, pokemon, source) {
			if (!this.activeMove) throw new Error("Battle.activeMove is null");
			if (!pokemon.hp || pokemon.item === 'stickybarb') return;
			if ((source && source !== pokemon) || this.activeMove.id === 'knockoff') {
				this.add('-activate', pokemon, 'ability: Sticky Hold');
				return false;
			}
		},
		flags: { breakable: 1 },
		name: "Sticky Hold",
		rating: 1.5,
		num: 60,
	},
	stormdrain: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Water') {
				if (!this.boost({ spa: 1 })) {
					this.add('-immune', target, '[from] ability: Storm Drain');
				}
				return null;
			}
		},
		onAnyRedirectTarget(target, source, source2, move) {
			if (move.type !== 'Water' || move.flags['pledgecombo']) return;
			const redirectTarget = ['randomNormal', 'adjacentFoe'].includes(move.target) ? 'normal' : move.target;
			if (this.validTarget(this.effectState.target, source, redirectTarget)) {
				if (move.smartTarget) move.smartTarget = false;
				if (this.effectState.target !== target) {
					this.add('-activate', this.effectState.target, 'ability: Storm Drain');
				}
				return this.effectState.target;
			}
		},
		flags: { breakable: 1 },
		name: "Storm Drain",
		rating: 3,
		num: 114,
	},
	strongjaw: {
		onBasePowerPriority: 19,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['bite']) {
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Strong Jaw",
		rating: 3.5,
		num: 173,
	},
	sturdy: {
		onTryHit(pokemon, target, move) {
			if (move.ohko) {
				this.add('-immune', pokemon, '[from] ability: Sturdy');
				return null;
			}
		},
		onDamagePriority: -30,
		onDamage(damage, target, source, effect) {
			if (target.hp === target.maxhp && damage >= target.hp && effect && effect.effectType === 'Move') {
				this.add('-ability', target, 'Sturdy');
				return target.hp - 1;
			}
		},
		flags: { breakable: 1 },
		name: "Sturdy",
		rating: 3,
		num: 5,
	},
	suctioncups: {
		onDragOutPriority: 1,
		onDragOut(pokemon) {
			this.add('-activate', pokemon, 'ability: Suction Cups');
			return null;
		},
		flags: { breakable: 1 },
		name: "Suction Cups",
		rating: 1,
		num: 21,
	},
	superluck: {
		onModifyCritRatio(critRatio) {
			return critRatio + 1;
		},
		flags: {},
		name: "Super Luck",
		rating: 1.5,
		num: 105,
	},
	supersweetsyrup: {
		onStart(pokemon) {
			if (pokemon.syrupTriggered) return;
			pokemon.syrupTriggered = true;
			this.add('-ability', pokemon, 'Supersweet Syrup');
			for (const target of pokemon.adjacentFoes()) {
				if (target.volatiles['substitute']) {
					this.add('-immune', target);
				} else {
					this.boost({ evasion: -1 }, target, pokemon, null, true);
				}
			}
		},
		flags: {},
		name: "Supersweet Syrup",
		rating: 1.5,
		num: 306,
	},
	supremeoverlord: {
		onStart(pokemon) {
			if (pokemon.side.totalFainted) {
				this.add('-activate', pokemon, 'ability: Supreme Overlord');
				const fallen = Math.min(pokemon.side.totalFainted, 5);
				this.add('-start', pokemon, `fallen${fallen}`, '[silent]');
				this.effectState.fallen = fallen;
			}
		},
		onEnd(pokemon) {
			this.add('-end', pokemon, `fallen${this.effectState.fallen}`, '[silent]');
		},
		onBasePowerPriority: 21,
		onBasePower(basePower, attacker, defender, move) {
			if (this.effectState.fallen) {
				const powMod = [4096, 4506, 4915, 5325, 5734, 6144];
				this.debug(`Supreme Overlord boost: ${powMod[this.effectState.fallen]}/4096`);
				return this.chainModify([powMod[this.effectState.fallen], 4096]);
			}
		},
		flags: {},
		name: "Supreme Overlord",
		rating: 4,
		num: 293,
	},
	surgesurfer: {
		onModifySpe(spe) {
			if (this.field.isTerrain('electricterrain')) {
				return this.chainModify(2);
			}
		},
		flags: {},
		name: "Surge Surfer",
		rating: 3,
		num: 207,
	},
	swarm: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Bug' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Swarm boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Bug' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Swarm boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Swarm",
		rating: 2,
		num: 68,
	},
	sweetveil: {
		onAllySetStatus(status, target, source, effect) {
			if (status.id === 'slp') {
				this.debug('Sweet Veil interrupts sleep');
				const effectHolder = this.effectState.target;
				this.add('-block', target, 'ability: Sweet Veil', `[of] ${effectHolder}`);
				return null;
			}
		},
		onAllyTryAddVolatile(status, target) {
			if (status.id === 'yawn') {
				this.debug('Sweet Veil blocking yawn');
				const effectHolder = this.effectState.target;
				this.add('-block', target, 'ability: Sweet Veil', `[of] ${effectHolder}`);
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Sweet Veil",
		rating: 2,
		num: 175,
	},
	swiftswim: {
		onModifySpe(spe, pokemon) {
			if (['raindance', 'primordialsea'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(2);
			}
		},
		flags: {},
		name: "Swift Swim",
		rating: 3,
		num: 33,
	},
	symbiosis: {
		onAllyAfterUseItem(item, pokemon) {
			if (pokemon.switchFlag) return;
			const source = this.effectState.target;
			const myItem = source.takeItem();
			if (!myItem) return;
			if (
				!this.singleEvent('TakeItem', myItem, source.itemState, pokemon, source, this.effect, myItem) ||
				!pokemon.setItem(myItem)
			) {
				source.item = myItem.id;
				return;
			}
			this.add('-activate', source, 'ability: Symbiosis', myItem, `[of] ${pokemon}`);
		},
		flags: {},
		name: "Symbiosis",
		rating: 0,
		num: 180,
	},
	synchronize: {
		onAfterSetStatus(status, target, source, effect) {
			if (!source || source === target) return;
			if (effect && effect.id === 'toxicspikes') return;
			if (status.id === 'slp' || status.id === 'frz') return;
			this.add('-activate', target, 'ability: Synchronize');
			// Hack to make status-prevention abilities think Synchronize is a status move
			// and show messages when activating against it.
			source.trySetStatus(status, target, { status: status.id, id: 'synchronize' } as Effect);
		},
		flags: {},
		name: "Synchronize",
		rating: 2,
		num: 28,
	},
	swordofruin: {
		onStart(pokemon) {
			if (this.suppressingAbility(pokemon)) return;
			this.add('-ability', pokemon, 'Sword of Ruin');
		},
		onAnyModifyDef(def, target, source, move) {
			const abilityHolder = this.effectState.target;
			if (target.hasAbility('Sword of Ruin')) return;
			if (!move.ruinedDef?.hasAbility('Sword of Ruin')) move.ruinedDef = abilityHolder;
			if (move.ruinedDef !== abilityHolder) return;
			this.debug('Sword of Ruin Def drop');
			return this.chainModify(0.75);
		},
		flags: {},
		name: "Sword of Ruin",
		rating: 4.5,
		num: 285,
	},
	tabletsofruin: {
		onStart(pokemon) {
			if (this.suppressingAbility(pokemon)) return;
			this.add('-ability', pokemon, 'Tablets of Ruin');
		},
		onAnyModifyAtk(atk, source, target, move) {
			const abilityHolder = this.effectState.target;
			if (source.hasAbility('Tablets of Ruin')) return;
			if (!move.ruinedAtk) move.ruinedAtk = abilityHolder;
			if (move.ruinedAtk !== abilityHolder) return;
			this.debug('Tablets of Ruin Atk drop');
			return this.chainModify(0.75);
		},
		flags: {},
		name: "Tablets of Ruin",
		rating: 4.5,
		num: 284,
	},
	tangledfeet: {
		onModifyAccuracyPriority: -1,
		onModifyAccuracy(accuracy, target) {
			if (typeof accuracy !== 'number') return;
			if (target?.volatiles['confusion']) {
				this.debug('Tangled Feet - decreasing accuracy');
				return this.chainModify(0.5);
			}
		},
		flags: { breakable: 1 },
		name: "Tangled Feet",
		rating: 1,
		num: 77,
	},
	tanglinghair: {
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target, true)) {
				this.add('-ability', target, 'Tangling Hair');
				this.boost({ spe: -1 }, source, target, null, true);
			}
		},
		flags: {},
		name: "Tangling Hair",
		rating: 2,
		num: 221,
	},
	technician: {
		onBasePowerPriority: 30,
		onBasePower(basePower, attacker, defender, move) {
			const basePowerAfterMultiplier = this.modify(basePower, this.event.modifier);
			this.debug(`Base Power: ${basePowerAfterMultiplier}`);
			if (basePowerAfterMultiplier <= 60) {
				this.debug('Technician boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Technician",
		rating: 3.5,
		num: 101,
	},
	telepathy: {
		onTryHit(target, source, move) {
			if (target !== source && target.isAlly(source) && move.category !== 'Status') {
				this.add('-activate', target, 'ability: Telepathy');
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Telepathy",
		rating: 0,
		num: 140,
	},
	teraformzero: {
		onAfterTerastallization(pokemon) {
			if (pokemon.baseSpecies.name !== 'Terapagos-Stellar') return;
			if (this.field.weather || this.field.terrain) {
				this.add('-ability', pokemon, 'Teraform Zero');
				this.field.clearWeather();
				this.field.clearTerrain();
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1 },
		name: "Teraform Zero",
		rating: 3,
		num: 309,
	},
	terashell: {
		// effectiveness implemented in sim/pokemon.ts:Pokemon#runEffectiveness
		// needs two checks to reset between regular moves and future attacks
		onAnyBeforeMove() {
			delete this.effectState.resisted;
		},
		onAnyAfterMove() {
			delete this.effectState.resisted;
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, breakable: 1 },
		name: "Tera Shell",
		rating: 3.5,
		num: 308,
	},
	terashift: {
		onSwitchInPriority: 2,
		onSwitchIn(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Terapagos') return;
			if (pokemon.species.forme !== 'Terastal') {
				this.add('-activate', pokemon, 'ability: Tera Shift');
				pokemon.formeChange('Terapagos-Terastal', this.effect, true);
				pokemon.baseMaxhp = Math.floor(Math.floor(
					2 * pokemon.species.baseStats['hp'] + pokemon.set.ivs['hp'] + Math.floor(pokemon.set.evs['hp'] / 4) + 100
				) * pokemon.level / 100 + 10);
				const newMaxHP = pokemon.baseMaxhp;
				pokemon.hp = newMaxHP - (pokemon.maxhp - pokemon.hp);
				pokemon.maxhp = newMaxHP;
				this.add('-heal', pokemon, pokemon.getHealth, '[silent]');
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1, notransform: 1 },
		name: "Tera Shift",
		rating: 3,
		num: 307,
	},
	teravolt: {
		onStart(pokemon) {
			this.add('-ability', pokemon, 'Teravolt');
		},
		onModifyMove(move) {
			move.ignoreAbility = true;
		},
		flags: {},
		name: "Teravolt",
		rating: 3,
		num: 164,
	},
	thermalexchange: {
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Fire') {
				this.boost({ atk: 1 });
			}
		},
		onUpdate(pokemon) {
			if (pokemon.status === 'brn') {
				this.add('-activate', pokemon, 'ability: Thermal Exchange');
				pokemon.cureStatus();
			}
		},
		onSetStatus(status, target, source, effect) {
			if (status.id !== 'brn') return;
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Thermal Exchange');
			}
			return false;
		},
		flags: { breakable: 1 },
		name: "Thermal Exchange",
		rating: 2.5,
		num: 270,
	},
	thickfat: {
		onSourceModifyAtkPriority: 6,
		onSourceModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Ice' || move.type === 'Fire') {
				this.debug('Thick Fat weaken');
				return this.chainModify(0.5);
			}
		},
		onSourceModifySpAPriority: 5,
		onSourceModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Ice' || move.type === 'Fire') {
				this.debug('Thick Fat weaken');
				return this.chainModify(0.5);
			}
		},
		flags: { breakable: 1 },
		name: "Thick Fat",
		rating: 3.5,
		num: 47,
	},
	tintedlens: {
		onModifyDamage(damage, source, target, move) {
			if (target.getMoveHitData(move).typeMod < 0) {
				this.debug('Tinted Lens boost');
				return this.chainModify(2);
			}
		},
		flags: {},
		name: "Tinted Lens",
		rating: 4,
		num: 110,
	},
	torrent: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Water' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Torrent boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Water' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Torrent boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Torrent",
		rating: 2,
		num: 67,
	},
	toughclaws: {
		onBasePowerPriority: 21,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['contact']) {
				return this.chainModify([5325, 4096]);
			}
		},
		flags: {},
		name: "Tough Claws",
		rating: 3.5,
		num: 181,
	},
	toxicboost: {
		onBasePowerPriority: 19,
		onBasePower(basePower, attacker, defender, move) {
			if ((attacker.status === 'psn' || attacker.status === 'tox') && move.category === 'Physical') {
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Toxic Boost",
		rating: 3,
		num: 137,
	},
	toxicchain: {
		onSourceDamagingHit(damage, target, source, move) {
			// Despite not being a secondary, Shield Dust / Covert Cloak block Toxic Chain's effect
			if (target.hasAbility('shielddust') || target.hasItem('covertcloak')) return;

			if (this.randomChance(3, 10)) {
				target.trySetStatus('tox', source);
			}
		},
		flags: {},
		name: "Toxic Chain",
		rating: 4.5,
		num: 305,
	},
	toxicdebris: {
		onDamagingHit(damage, target, source, move) {
			const side = source.isAlly(target) ? source.side.foe : source.side;
			const toxicSpikes = side.sideConditions['toxicspikes'];
			if (move.category === 'Physical' && (!toxicSpikes || toxicSpikes.layers < 2)) {
				this.add('-activate', target, 'ability: Toxic Debris');
				side.addSideCondition('toxicspikes', target);
			}
		},
		flags: {},
		name: "Toxic Debris",
		rating: 3.5,
		num: 295,
	},
	trace: {
		onStart(pokemon) {
			this.effectState.seek = true;
			// n.b. only affects Hackmons
			// interaction with No Ability is complicated: https://www.smogon.com/forums/threads/pokemon-sun-moon-battle-mechanics-research.3586701/page-76#post-7790209
			if (pokemon.adjacentFoes().some(foeActive => foeActive.ability === 'noability')) {
				this.effectState.seek = false;
			}
			// interaction with Ability Shield is similar to No Ability
			if (pokemon.hasItem('Ability Shield')) {
				this.add('-block', pokemon, 'item: Ability Shield');
				this.effectState.seek = false;
			}
			if (this.effectState.seek) {
				this.singleEvent('Update', this.effect, this.effectState, pokemon);
			}
		},
		onUpdate(pokemon) {
			if (!this.effectState.seek) return;

			const possibleTargets = pokemon.adjacentFoes().filter(
				target => !target.getAbility().flags['notrace'] && target.ability !== 'noability'
			);
			if (!possibleTargets.length) return;

			const target = this.sample(possibleTargets);
			const ability = target.getAbility();
			if (pokemon.setAbility(ability)) {
				this.add('-ability', pokemon, ability, '[from] ability: Trace', `[of] ${target}`);
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1 },
		name: "Trace",
		rating: 2.5,
		num: 36,
	},
	transistor: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Electric') {
				this.debug('Transistor boost');
				return this.chainModify([5325, 4096]);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Electric') {
				this.debug('Transistor boost');
				return this.chainModify([5325, 4096]);
			}
		},
		flags: {},
		name: "Transistor",
		rating: 3.5,
		num: 262,
	},
	triage: {
		onModifyPriority(priority, pokemon, target, move) {
			if (move?.flags['heal']) return priority + 3;
		},
		flags: {},
		name: "Triage",
		rating: 3.5,
		num: 205,
	},
	truant: {
		onStart(pokemon) {
			pokemon.removeVolatile('truant');
			if (pokemon.activeTurns && (pokemon.moveThisTurnResult !== undefined || !this.queue.willMove(pokemon))) {
				pokemon.addVolatile('truant');
			}
		},
		onBeforeMovePriority: 9,
		onBeforeMove(pokemon) {
			if (pokemon.removeVolatile('truant')) {
				this.add('cant', pokemon, 'ability: Truant');
				return false;
			}
			pokemon.addVolatile('truant');
		},
		condition: {},
		flags: {},
		name: "Truant",
		rating: -1,
		num: 54,
	},
	turboblaze: {
		onStart(pokemon) {
			this.add('-ability', pokemon, 'Turboblaze');
		},
		onModifyMove(move) {
			move.ignoreAbility = true;
		},
		flags: {},
		name: "Turboblaze",
		rating: 3,
		num: 163,
	},
	unaware: {
		onAnyModifyBoost(boosts, pokemon) {
			const unawareUser = this.effectState.target;
			if (unawareUser === pokemon) return;
			if (unawareUser === this.activePokemon && pokemon === this.activeTarget) {
				boosts['def'] = 0;
				boosts['spd'] = 0;
				boosts['evasion'] = 0;
			}
			if (pokemon === this.activePokemon && unawareUser === this.activeTarget) {
				boosts['atk'] = 0;
				boosts['def'] = 0;
				boosts['spa'] = 0;
				boosts['accuracy'] = 0;
			}
		},
		flags: { breakable: 1 },
		name: "Unaware",
		rating: 4,
		num: 109,
	},
	unburden: {
		onAfterUseItem(item, pokemon) {
			if (pokemon !== this.effectState.target) return;
			pokemon.addVolatile('unburden');
		},
		onTakeItem(item, pokemon) {
			pokemon.addVolatile('unburden');
		},
		onEnd(pokemon) {
			pokemon.removeVolatile('unburden');
		},
		condition: {
			onModifySpe(spe, pokemon) {
				if (!pokemon.item && !pokemon.ignoringAbility()) {
					return this.chainModify(2);
				}
			},
		},
		flags: {},
		name: "Unburden",
		rating: 3.5,
		num: 84,
	},
	unnerve: {
		onSwitchInPriority: 1,
		onStart(pokemon) {
			if (this.effectState.unnerved) return;
			this.add('-ability', pokemon, 'Unnerve');
			this.effectState.unnerved = true;
		},
		onEnd() {
			this.effectState.unnerved = false;
		},
		onFoeTryEatItem() {
			return !this.effectState.unnerved;
		},
		flags: {},
		name: "Unnerve",
		rating: 1,
		num: 127,
	},
	unseenfist: {
		onModifyMove(move) {
			if (move.flags['contact']) delete move.flags['protect'];
		},
		flags: {},
		name: "Unseen Fist",
		rating: 2,
		num: 260,
	},
	vesselofruin: {
		onStart(pokemon) {
			if (this.suppressingAbility(pokemon)) return;
			this.add('-ability', pokemon, 'Vessel of Ruin');
		},
		onAnyModifySpA(spa, source, target, move) {
			const abilityHolder = this.effectState.target;
			if (source.hasAbility('Vessel of Ruin')) return;
			if (!move.ruinedSpA) move.ruinedSpA = abilityHolder;
			if (move.ruinedSpA !== abilityHolder) return;
			this.debug('Vessel of Ruin SpA drop');
			return this.chainModify(0.75);
		},
		flags: {},
		name: "Vessel of Ruin",
		rating: 4.5,
		num: 284,
	},
	victorystar: {
		onAnyModifyAccuracyPriority: -1,
		onAnyModifyAccuracy(accuracy, target, source) {
			if (source.isAlly(this.effectState.target) && typeof accuracy === 'number') {
				return this.chainModify([4506, 4096]);
			}
		},
		flags: {},
		name: "Victory Star",
		rating: 2,
		num: 162,
	},
	vitalspirit: {
		onUpdate(pokemon) {
			if (pokemon.status === 'slp') {
				this.add('-activate', pokemon, 'ability: Vital Spirit');
				pokemon.cureStatus();
			}
		},
		onSetStatus(status, target, source, effect) {
			if (status.id !== 'slp') return;
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Vital Spirit');
			}
			return false;
		},
		onTryAddVolatile(status, target) {
			if (status.id === 'yawn') {
				this.add('-immune', target, '[from] ability: Vital Spirit');
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Vital Spirit",
		rating: 1.5,
		num: 72,
	},
	voltabsorb: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Electric') {
				if (!this.heal(target.baseMaxhp / 4)) {
					this.add('-immune', target, '[from] ability: Volt Absorb');
				}
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Volt Absorb",
		rating: 3.5,
		num: 10,
	},
	wanderingspirit: {
		onDamagingHit(damage, target, source, move) {
			if (source.getAbility().flags['failskillswap'] || target.volatiles['dynamax']) return;

			if (this.checkMoveMakesContact(move, source, target)) {
				const targetCanBeSet = this.runEvent('SetAbility', target, source, this.effect, source.ability);
				if (!targetCanBeSet) return targetCanBeSet;
				const sourceAbility = source.setAbility('wanderingspirit', target);
				if (!sourceAbility) return;
				if (target.isAlly(source)) {
					this.add('-activate', target, 'Skill Swap', '', '', `[of] ${source}`);
				} else {
					this.add('-activate', target, 'ability: Wandering Spirit', this.dex.abilities.get(sourceAbility).name, 'Wandering Spirit', `[of] ${source}`);
				}
				target.setAbility(sourceAbility);
			}
		},
		flags: {},
		name: "Wandering Spirit",
		rating: 2.5,
		num: 254,
	},
	waterabsorb: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Water') {
				if (!this.heal(target.baseMaxhp / 4)) {
					this.add('-immune', target, '[from] ability: Water Absorb');
				}
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Water Absorb",
		rating: 3.5,
		num: 11,
	},
	waterbubble: {
		onSourceModifyAtkPriority: 5,
		onSourceModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Fire') {
				return this.chainModify(0.5);
			}
		},
		onSourceModifySpAPriority: 5,
		onSourceModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Fire') {
				return this.chainModify(0.5);
			}
		},
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Water') {
				return this.chainModify(2);
			}
		},
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Water') {
				return this.chainModify(2);
			}
		},
		onUpdate(pokemon) {
			if (pokemon.status === 'brn') {
				this.add('-activate', pokemon, 'ability: Water Bubble');
				pokemon.cureStatus();
			}
		},
		onSetStatus(status, target, source, effect) {
			if (status.id !== 'brn') return;
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Water Bubble');
			}
			return false;
		},
		flags: { breakable: 1 },
		name: "Water Bubble",
		rating: 4.5,
		num: 199,
	},
	watercompaction: {
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Water') {
				this.boost({ def: 2 });
			}
		},
		flags: {},
		name: "Water Compaction",
		rating: 1.5,
		num: 195,
	},
	waterveil: {
		onUpdate(pokemon) {
			if (pokemon.status === 'brn') {
				this.add('-activate', pokemon, 'ability: Water Veil');
				pokemon.cureStatus();
			}
		},
		onSetStatus(status, target, source, effect) {
			if (status.id !== 'brn') return;
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Water Veil');
			}
			return false;
		},
		flags: { breakable: 1 },
		name: "Water Veil",
		rating: 2,
		num: 41,
	},
	weakarmor: {
		onDamagingHit(damage, target, source, move) {
			if (move.category === 'Physical') {
				this.boost({ def: -1, spe: 2 }, target, target);
			}
		},
		flags: {},
		name: "Weak Armor",
		rating: 1,
		num: 133,
	},
	wellbakedbody: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Fire') {
				if (!this.boost({ def: 2 })) {
					this.add('-immune', target, '[from] ability: Well-Baked Body');
				}
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Well-Baked Body",
		rating: 3.5,
		num: 273,
	},
	whitesmoke: {
		onTryBoost(boost, target, source, effect) {
			if (source && target === source) return;
			let showMsg = false;
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! < 0) {
					delete boost[i];
					showMsg = true;
				}
			}
			if (showMsg && !(effect as ActiveMove).secondaries && effect.id !== 'octolock') {
				this.add("-fail", target, "unboost", "[from] ability: White Smoke", `[of] ${target}`);
			}
		},
		flags: { breakable: 1 },
		name: "White Smoke",
		rating: 2,
		num: 73,
	},
	wimpout: {
		onEmergencyExit(target) {
			if (!this.canSwitch(target.side) || target.forceSwitchFlag || target.switchFlag) return;
			for (const side of this.sides) {
				for (const active of side.active) {
					active.switchFlag = false;
				}
			}
			target.switchFlag = true;
			this.add('-activate', target, 'ability: Wimp Out');
		},
		flags: {},
		name: "Wimp Out",
		rating: 1,
		num: 193,
	},
	windpower: {
		onDamagingHitOrder: 1,
		onDamagingHit(damage, target, source, move) {
			if (move.flags['wind']) {
				target.addVolatile('charge');
			}
		},
		onAllySideConditionStart(target, source, sideCondition) {
			const pokemon = this.effectState.target;
			if (sideCondition.id === 'tailwind') {
				pokemon.addVolatile('charge');
			}
		},
		flags: {},
		name: "Wind Power",
		rating: 1,
		num: 277,
	},
	windrider: {
		onStart(pokemon) {
			if (pokemon.side.sideConditions['tailwind']) {
				this.boost({ atk: 1 }, pokemon, pokemon);
			}
		},
		onTryHit(target, source, move) {
			if (target !== source && move.flags['wind']) {
				if (!this.boost({ atk: 1 }, target, target)) {
					this.add('-immune', target, '[from] ability: Wind Rider');
				}
				return null;
			}
		},
		onAllySideConditionStart(target, source, sideCondition) {
			const pokemon = this.effectState.target;
			if (sideCondition.id === 'tailwind') {
				this.boost({ atk: 1 }, pokemon, pokemon);
			}
		},
		flags: { breakable: 1 },
		name: "Wind Rider",
		rating: 3.5,
		// We do not want Brambleghast to get Infiltrator in Randbats
		num: 274,
	},
	wonderguard: {
		onTryHit(target, source, move) {
			if (target === source || move.category === 'Status' || move.type === '???' || move.id === 'struggle') return;
			if (move.id === 'skydrop' && !source.volatiles['skydrop']) return;
			this.debug('Wonder Guard immunity: ' + move.id);
			if (target.runEffectiveness(move) <= 0 || !target.runImmunity(move)) {
				if (move.smartTarget) {
					move.smartTarget = false;
				} else {
					this.add('-immune', target, '[from] ability: Wonder Guard');
				}
				return null;
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, failskillswap: 1, breakable: 1 },
		name: "Wonder Guard",
		rating: 5,
		num: 25,
	},
	wonderskin: {
		onModifyAccuracyPriority: 10,
		onModifyAccuracy(accuracy, target, source, move) {
			if (move.category === 'Status' && typeof accuracy === 'number') {
				this.debug('Wonder Skin - setting accuracy to 50');
				return 50;
			}
		},
		flags: { breakable: 1 },
		name: "Wonder Skin",
		rating: 2,
		num: 147,
	},
	zenmode: {
		onResidualOrder: 29,
		onResidual(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Darmanitan' || pokemon.transformed) {
				return;
			}
			if (pokemon.hp <= pokemon.maxhp / 2 && !['Zen', 'Galar-Zen'].includes(pokemon.species.forme)) {
				pokemon.addVolatile('zenmode');
			} else if (pokemon.hp > pokemon.maxhp / 2 && ['Zen', 'Galar-Zen'].includes(pokemon.species.forme)) {
				pokemon.addVolatile('zenmode'); // in case of base Darmanitan-Zen
				pokemon.removeVolatile('zenmode');
			}
		},
		onEnd(pokemon) {
			if (!pokemon.volatiles['zenmode'] || !pokemon.hp) return;
			pokemon.transformed = false;
			delete pokemon.volatiles['zenmode'];
			if (pokemon.species.baseSpecies === 'Darmanitan' && pokemon.species.battleOnly) {
				pokemon.formeChange(pokemon.species.battleOnly as string, this.effect, false, '0', '[silent]');
			}
		},
		condition: {
			onStart(pokemon) {
				if (!pokemon.species.name.includes('Galar')) {
					if (pokemon.species.id !== 'darmanitanzen') pokemon.formeChange('Darmanitan-Zen');
				} else {
					if (pokemon.species.id !== 'darmanitangalarzen') pokemon.formeChange('Darmanitan-Galar-Zen');
				}
			},
			onEnd(pokemon) {
				if (['Zen', 'Galar-Zen'].includes(pokemon.species.forme)) {
					pokemon.formeChange(pokemon.species.battleOnly as string);
				}
			},
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Zen Mode",
		rating: 0,
		num: 161,
	},
	zerotohero: {
		onSwitchOut(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Palafin') return;
			if (pokemon.species.forme !== 'Hero') {
				pokemon.formeChange('Palafin-Hero', this.effect, true);
			}
		},
		onSwitchIn(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Palafin') return;
			if (!this.effectState.heroMessageDisplayed && pokemon.species.forme === 'Hero') {
				this.add('-activate', pokemon, 'ability: Zero to Hero');
				this.effectState.heroMessageDisplayed = true;
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1, notransform: 1 },
		name: "Zero to Hero",
		rating: 5,
		num: 278,
	},

	// CAP
	mountaineer: {
		onDamage(damage, target, source, effect) {
			if (effect && effect.id === 'stealthrock') {
				return false;
			}
		},
		onTryHit(target, source, move) {
			if (move.type === 'Rock' && !target.activeTurns) {
				this.add('-immune', target, '[from] ability: Mountaineer');
				return null;
			}
		},
		isNonstandard: "CAP",
		flags: { breakable: 1 },
		name: "Mountaineer",
		rating: 3,
		num: -2,
	},
	rebound: {
		isNonstandard: "CAP",
		onTryHitPriority: 1,
		onTryHit(target, source, move) {
			if (this.effectState.target.activeTurns) return;

			if (target === source || move.hasBounced || !move.flags['reflectable']) {
				return;
			}
			const newMove = this.dex.getActiveMove(move.id);
			newMove.hasBounced = true;
			this.actions.useMove(newMove, target, { target: source });
			return null;
		},
		onAllyTryHitSide(target, source, move) {
			if (this.effectState.target.activeTurns) return;

			if (target.isAlly(source) || move.hasBounced || !move.flags['reflectable']) {
				return;
			}
			const newMove = this.dex.getActiveMove(move.id);
			newMove.hasBounced = true;
			this.actions.useMove(newMove, this.effectState.target, { target: source });
			return null;
		},
		condition: {
			duration: 1,
		},
		flags: { breakable: 1 },
		name: "Rebound",
		rating: 3,
		num: -3,
	},
	persistent: {
		isNonstandard: "CAP",
		// implemented in the corresponding move
		flags: {},
		name: "Persistent",
		rating: 3,
		num: -4,
	},
	//New Abilities
	junglespirit: {
		onStart(pokemon) {
			if (pokemon.ability === 'junglespirit') {
			  if (pokemon.species.id === 'shyleon') {
				this.add('-formechange', pokemon, 'Shyleon-Astro');
				pokemon.formeChange('Shyleon-Astro');
			  }
			}
		  },
		  onModifySTAB(stab, source, target, move) {
			if (move.forceSTAB || source.hasType(move.type)) {
				if (stab === 2) {
					return 2.25;
				}
				return 2;
			}
		},
		name: "Jungle Spirit",
		rating: 4,
		num: 91,
		shortDesc: "This Pokemon's same-type attack bonus (STAB) is 2 instead of 1.5.",
	},
	dragonarmor: {
		onStart(pokemon) {
			if (pokemon.ability === 'dragonarmor') {
			  if (pokemon.species.id === 'shulong') {
				this.add('-formechange', pokemon, 'Shulong-Astro');
				pokemon.formeChange('Shulong-Astro');
			  }
			}
		  },
		  onModifySTAB(stab, source, target, move) {
			if (move.forceSTAB || source.hasType(move.type)) {
				if (stab === 2) {
					return 2.25;
				}
				return 2;
			}
		},
		name: "Dragon Armor",
		rating: 4,
		num: 91,
		shortDesc: "This Pokemon's same-type attack bonus (STAB) is 2 instead of 1.5.",
	},
	voicetuning: {
		onStart(pokemon) {
			if (pokemon.ability === 'voicetuning') {
			  if (pokemon.species.id === 'trishout') {
				this.add('-formechange', pokemon, 'Trishout-Astro');
				pokemon.formeChange('Trishout-Astro');
			  }
			}
		  },
		  onModifySTAB(stab, source, target, move) {
			if (move.forceSTAB || source.hasType(move.type)) {
				if (stab === 2) {
					return 2.25;
				}
				return 2;
			}
		},
		name: "Voice Tuning",
		rating: 4,
		num: 91,
		shortDesc: "This Pokemon's same-type attack bonus (STAB) is 2 instead of 1.5.",
	},
	swarming: {
		onStart(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Strelavison' || pokemon.level < 20 || pokemon.transformed) return;
			if (pokemon.hp > pokemon.maxhp / 4) {
				if (pokemon.species.id === 'strelavison') {
					pokemon.formeChange('Strelavison-Swarm');
				}
			} else {
				if (pokemon.species.id === 'strelavisonswarm') {
					pokemon.formeChange('Strelavison');
				}
			}
		},
		onResidualOrder: 29,
		onResidual(pokemon) {
			if (
				pokemon.baseSpecies.baseSpecies !== 'Strelavison' || pokemon.level < 20 ||
				pokemon.transformed || !pokemon.hp
			) return;
			if (pokemon.hp > pokemon.maxhp / 4) {
				if (pokemon.species.id === 'strelavison') {
					pokemon.formeChange('Strelavison-Swarm');
				}
			} else {
				if (pokemon.species.id === 'strelavisonswarm') {
					pokemon.formeChange('Strelavison');
				}
			}
		},
		name: "Swarming",
		flags: {failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1},
		rating: 3,
		num: 208,
	},
	dirtypool: {
		onStart(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Chimaooze' || pokemon.level < 20 || pokemon.transformed) return;
			if (pokemon.hp > pokemon.maxhp / 4) {
				if (pokemon.species.id === 'chimaooze') {
					pokemon.formeChange('Chimaooze-Pooled');
				}
			} else {
				if (pokemon.species.id === 'chimaoozepooled') {
					pokemon.formeChange('Chimaooze');
				}
			}
		},
		onResidualOrder: 29,
		onResidual(pokemon) {
			if (
				pokemon.baseSpecies.baseSpecies !== 'Chimaooze' || pokemon.level < 20 ||
				pokemon.transformed || !pokemon.hp
			) return;
			if (pokemon.hp > pokemon.maxhp / 4) {
				if (pokemon.species.id === 'chimaooze') {
					pokemon.formeChange('Chimaooze-Pooled');
				}
			} else {
				if (pokemon.species.id === 'chimaoozepooled') {
					pokemon.formeChange('Chimaooze');
				}
			}
		},
		name: "Dirty Pool",
		flags: {failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1},
		rating: 3,
		num: 208,
	},
	// Insurgence
	absolution: {
		onModifySpAPriority: 5,
		onModifySpA(spa, pokemon) {
			if (['newmoon'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(1.5);
			}
		},
		onWeather(target, source, effect) {
			if (target.hasItem('utilityumbrella')) return;
			if (effect.id === 'newmoon') {
				this.damage(target.baseMaxhp / 8, target, target);
			}
		},
		name: "Absolution",
		rating: 2,
		num: 94,
		shortDesc: "This Pokemon's Sp. Atk is 1.5x in Darkness; loses 1/8 max HP per turn.",
	},
	amplifier: {
		onBasePowerPriority: 7,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['sound']) {
				this.debug('Amplifier boost');
				return this.chainModify(1.3);
			}
		},
		name: "Amplifier",
		rating: 3,
		num: 283,
		shortDesc: "This Pokemon's Sound-based moves are boosted by 1.3x.",
	},
	athenian: {
		onModifySpAPriority: 5,
		onModifySpA(SpA) {
			return this.chainModify(2);
		},
		name: "Athenian",
		rating: 5,
		num: 37,
		shortDesc: "Doubles the Pokemon's Special Attack stat.",
	},
	blazeboost: {
		onBeforeMovePriority: 0.5,
		onBeforeMove(attacker, defender, move) {
			if (move.category === 'Status') return;
			if (move.type === 'Fire') {
				this.boost({spa: 1, atk: 1, spe: 1}, attacker);
				if (attacker.species.id === 'emolgadelta') {
					attacker.formeChange('Emolga-Delta-Blaze');
				}
			}
		},
		onDamagingHit(damage, target, source, move) {
			if (target.species.id !== 'emolgadeltablaze') return;
			if (this.checkMoveMakesContact(move, source, target)) {
				if (this.randomChance(1, 10)) {
					source.trySetStatus('brn', target);
				}
			}
		},
		name: "Blaze Boost",
		gen: 6,
		rating: 4,
		num: 12,
		shortDesc: "Increases Atk, SpA and Spe before using Fire moves. May burn on contact.",
	},
	chlorofury: {
		onStart(pokemon) {
			pokemon.addVolatile('chlorofury');
		},
		onEnd(pokemon) {
			delete pokemon.volatiles['chlorofury'];
			this.add('-end', pokemon, 'Chlorofury', '[silent]');
		},
		condition: {
			duration: 2,
			onStart(target) {
				this.add('-start', target, 'ability: Chlorofury', '[silent]');
				{const i = target.side.pokemon.filter(ally => ally.fainted);
					this.boost({spa: i.length}, target)};
				this.boost({spe: 1}, target);
			},
			onEnd(target) {
				this.add('-end', target, 'Chlorofury', '[silent]');
				{const i = target.side.pokemon.filter(ally => ally.fainted);
					this.boost({spa: -i.length}, target)};
				this.boost({spe: -1}, target);
			},
		},
		name: "Chlorofury",
		rating: 2,
		num: 200,
		shortDesc: "On entry this Pokemon boosts its stats to avenge its allies.",
	},
	etherealshroud: {
		onStart(pokemon) {
			this.add('-start', pokemon, 'typeadd', 'Ghost', '[from] ability: Ethereal Shroud');
		},
		onTryHit(target, source, move) {
			if (move.category === 'Status' || source.hasAbility('scrappy') || target === source) return;
			if (target.volatiles['miracleeye'] || target.volatiles['foresight']) return;
			if (move.type === 'Normal' || move.type === 'Fighting') {
				this.add('-immune', target);
				return null;
			}
		},
		onAllyTryHitSide(target, source, move) {
			if (move.category === 'Status' || source.hasAbility('scrappy') || target === source) return;
			if (target.volatiles['miracleeye'] || target.volatiles['foresight']) return;
			if (move.type === 'Normal' || move.type === 'Fighting') {
				this.add('-immune', target, '[from] ability: Ethereal Shroud');
			}
		},
		onSourceBasePowerPriority: 18,
		onSourceBasePower(basePower, attacker, defender, move) {
			if (move.type === 'Bug' || move.type === 'Poison') {
				return this.chainModify(0.5);
			}
		},
		onModifyMove(move) {
			if (move.type === 'Ghost')
				move.forceSTAB = true;
		},
		name: "Ethereal Shroud",
		rating: 1,
		num: 194,
		shortDesc: "This Pokemon gains the Ghost-Type defensivley.",
	},
	eventhorizon: {
	onDamagingHit(damage, target, source, move) {
		if (move.flags['contact']) {
			source.addVolatile('trapped', target, move, 'trapper');
		}
	},
	name: "Event Horizon",
	rating: 4.5,
	num: 194,
	shortDesc: "Any Pokemon that contacts this one can't escape.",
},
foundry: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Rock' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status')) {
				move.type = 'Fire';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		onModifyMove(move) {
			if (move.id === 'stealthrock') {
				move.id === 'stealthcoal';
			}
		},
		//if this doesnt work then change to onModifyMove
		name: "Foundry",
		rating: 4,
		num: 13,
		shortDesc: "Rock-type moves, when used, melt and become Fire Type.",
	},
	heliophobia: {
		onWeather(target, source, effect) {
			if (target.hasItem('utilityumbrella')) return;
			if (effect.id === 'newmoon') {
				this.heal(target.baseMaxhp / 8);
			} else if (effect.id === 'sunnyday' || effect.id === 'desolateland') {
				this.damage(target.baseMaxhp / 8, target, target);
			}
		},
		name: "Heliophobia",
		rating: 3,
		num: 87,
		shortDesc: "This Pokemon gains 1/8 HP every turn in New Moon; loses 1/8 HP in Sun.",
	},
	hubris: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === 'Move') {
				this.boost({spa: length}, source);
			}
		},
		name: "Hubris",
		rating: 3,
		num: 289,
		shortDesc: "This Pokemon's Sp. Atk is raised by 1 stage if it attacks and KOes another Pokemon.",
	},
	intoxicate: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status') && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Poison';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		name: "Intoxicate",
		rating: 4,
		num: 182,
		shortDesc: "This Pokemon's Normal-type moves become Poison type and have 1.2x power.",
	},
	irrelephant: {
		onModifyMovePriority: -5,
		onModifyMove(move, target) {
			if (!move.ignoreImmunity) move.ignoreImmunity = {};
			if (move.ignoreImmunity !== true) {
				move.ignoreAbility = false;
				move.ignoreImmunity['Bug'] = true;
				move.ignoreImmunity['Dark'] = true;
				move.ignoreImmunity['Dragon'] = true;
				move.ignoreImmunity['Electric'] = true;
				move.ignoreImmunity['Fairy'] = true;
				move.ignoreImmunity['Fighting'] = true;
				move.ignoreImmunity['Fire'] = true;
				move.ignoreImmunity['Flying'] = true;
				move.ignoreImmunity['Ghost'] = true;
				move.ignoreImmunity['Grass'] = true;
				move.ignoreImmunity['Ground'] = true;
				move.ignoreImmunity['Ice'] = true;
				move.ignoreImmunity['Normal'] = true;
				move.ignoreImmunity['Poison'] = true;
				move.ignoreImmunity['Psychic'] = true;
				move.ignoreImmunity['Rock'] = true;
				move.ignoreImmunity['Steel'] = true;
				move.ignoreImmunity['Water'] = true;
				move.ignoreImmunity['Crystal'] = true;
				if(target.hasAbility('levitate')) move.ignoreImmunity['Ground'] = false;
			}
		},
		name: "Irrelephant",
		rating: 3,
		num: 280,
		shortDesc: "Immunities are irrelephant to this Pokémon's attacks.",
	},
	lernean: {
		onResidualOrder: 29,
		onResidual(pokemon) {
			if (!pokemon.baseSpecies.id.includes('hydreigonmega') || !pokemon.species.id.includes('hydreigonmega') || !pokemon.hp) {
				return;
			}
			if (pokemon.species.id === 'hydreigonmeganine') return;
			if (pokemon.hp < (pokemon.maxhp / 5)) {
				this.add('-activate', pokemon, 'ability: Lernean');
				pokemon.formeChange('Hydreigon-Mega-Nine', this.effect, true);
				return;
			}
			if (pokemon.species.id === 'hydreigonmegaeight') return;
			if (pokemon.hp < (2 * pokemon.maxhp / 5)) {
				this.add('-activate', pokemon, 'ability: Lernean');
				pokemon.formeChange('Hydreigon-Mega-Eight', this.effect, true);
				return;
			}
			if (pokemon.species.id === 'hydreigonmegaseven') return;
			if (pokemon.hp < (3 * pokemon.maxhp / 5)) {
				this.add('-activate', pokemon, 'ability: Lernean');
				pokemon.formeChange('Hydreigon-Mega-Seven', this.effect, true);
				return;
			}
			if (pokemon.species.id === 'hydreigonmegasix') return;
			if (pokemon.hp < (4 * pokemon.maxhp / 5)) {
				this.add('-activate', pokemon, 'ability: Lernean');
				pokemon.formeChange('Hydreigon-Mega-Six', this.effect, true);
			}
		},
		onPrepareHit(source, target, move) {
			if (!source.species.id.includes('hydreigonmega')) return;
			if (move.category === 'Status' || move.selfdestruct || move.multihit) return;
			if ([
				'dynamaxcannon', 'endeavor', 'fling', 'iceball', 'rollout',
				'dragonrage', 'sonicboom', 'seismictoss', 'naturalgift'
			].includes(move.id)) return;
			if (!move.flags['charge'] && !move.spreadHit && !move.isZ && !move.isMax) {
				if (source.species.id === 'hydreigonmeganine') move.multihit = 9;
				else if (source.species.id === 'hydreigonmegaeight') move.multihit = 8;
				else if (source.species.id === 'hydreigonmegaseven') move.multihit = 7;
				else if (source.species.id === 'hydreigonmegasix') move.multihit = 6;
				else move.multihit = 5;
				move.multihitType = 'parentalbond';
			}
		},
		// Damage modifier implemented in BattleActions#modifyDamage()
		onSourceModifySecondaries(secondaries, target, source, move) {
			if (move.multihitType === 'parentalbond' && move.id === 'secretpower' && move.hit < 2) {
				// hack to prevent accidentally suppressing King's Rock/Razor Fang
				return secondaries.filter(effect => effect.volatileStatus === 'flinch');
			}
		},
		name: "Lernean",
		flags: {failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1},
		gen: 6,
		rating: 4,
		num: 18,
		shortDesc: "Hydreigon-Mega gains heads when losing HP and hits once for each head.",
	},
	noctem: {
		onStart(source) {
			this.field.setWeather('newmoon');
		},
		name: "Noctem",
		rating: 4,
		num: 290,
		shortDesc: "On switch-in, this Pokemon summons Noctem.",
	},
	pendulum: {
		onStart(pokemon) {
			pokemon.addVolatile('pendulum');
		},
		condition: {
			onStart(pokemon) {
				this.effectState.lastMove = '';
				this.effectState.numConsecutive = 0;
			},
			onTryMovePriority: -2,
			onTryMove(pokemon, target, move) {
				if (!pokemon.hasAbility('pendulum')) {
					pokemon.removeVolatile('pendulum');
					return;
				}
				if (this.effectState.lastMove === move.id && pokemon.moveLastTurnResult) {
					this.effectState.numConsecutive++;
				} else if (pokemon.volatiles['twoturnmove'] && this.effectState.lastMove !== move.id) {
					this.effectState.numConsecutive = 1;
				} else {
					this.effectState.numConsecutive = 0;
				}
				this.effectState.lastMove = move.id;
			},
			onModifyDamage(damage, source, target, move) {
				const dmgMod = [4096, 4915, 5734, 6553, 7372, 8192];
				const numConsecutive = this.effectState.numConsecutive > 5 ? 5 : this.effectState.numConsecutive;
				this.debug(`Current Pendulum boost: ${dmgMod[numConsecutive]}/4096`);
				return this.chainModify([dmgMod[numConsecutive], 4096]);
			},
		},
		name: "Pendulum",
		gen: 6,
		rating: 4.5,
		num: 21,
		shortDesc: "Consecutively using the same move increases its damage.",
	},
	periodicorbit: {
		//coded into the moves themselves
		name: "Periodic Orbit",
		rating: 3,
		num: 253,
		shortDesc: "Delayed moves will orbit and activate twice.",
	},
	phototroph: {
		onWeather(target, source, effect) {
			if (target.hasItem('utilityumbrella')) return;
			if (effect.id === 'sunnyday' || effect.id === 'desolateland') {
				this.heal(target.baseMaxhp / 8, target, target);
				return;
			} else if (effect.id === 'newmoon' || effect.id === 'raindance' || effect.id === 'primordialsea') {
				this.heal(target.baseMaxhp / 0, target, target);
				return;
			} else this.heal(target.baseMaxhp / 16, target, target);
		},
		onResidualOrder: 5,
		onResidualSubOrder: 5,
		onResidual(pokemon) {
			switch (pokemon.effectiveWeather()) {
				case 'raindance':
				case 'primordialsea':
				case 'newmoon':
				case 'sunnyday':
				case 'desolateland':
				case 'hail':
				case 'sleet':
				case 'sandstorm':
				case 'deltastream':
			return;
				default:
			this.heal(pokemon.baseMaxhp / 16);
			}
		},
		name: "Phototroph",
		rating: 2,
		num: 253,
		shortDesc: "Restores 1/16 of total HP at the end of each turn, 1/8 in Sun and has no effect in other weather.",
	},
	prismguard: {
		onDamagingHitOrder: 1,
		onDamagingHit(damage, target, source, move) {
			if (!move.flags['contact'] && move.category !== 'Status') {
				this.damage(source.baseMaxhp / 8, source, target);
			}
		},
		name: "Prism Guard",
		rating: 2.5,
		num: 24,
		shortDesc: "Pokemon not making contact with this Pokemon lose 1/8 of their max HP.",
	},
	psychocall: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Psychic' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Psycho Call boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Psychic' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Psycho Call boost');
				return this.chainModify(1.5);
			}
		},
		name: "Psycho Call",
		rating: 2,
		num: 268,
		shortDesc: "Powers up Psychic-type moves in a pinch",
	},
	regurgitation: {
		onAfterMove(pokemon, target, move) {
			if (pokemon === target) return;
			if (pokemon.species.baseSpecies !== 'Muk-Delta') return;
			const regurgMove = this.dex.getActiveMove('sonicboom');
			regurgMove.accuracy = true;
			if (pokemon.species.id === 'mukdeltawater') regurgMove.type = 'Water';
			if (pokemon.species.id === 'mukdeltagrass') regurgMove.type = 'Grass';
			if (pokemon.species.id === 'mukdeltafire') regurgMove.type = 'Fire';
			if (pokemon.species.id === 'mukdeltadark') regurgMove.type = 'Dark';
			if (pokemon.species.id === 'mukdeltanormal') regurgMove.type = 'Normal';
			if (pokemon.species.id === 'mukdeltapsychic') regurgMove.type = 'Psychic';
			const regurgEffectiveness = this.dex.getEffectiveness(regurgMove.type, target);
			const regurgDamage = Math.floor((2 ** regurgEffectiveness) * target.baseMaxhp / 6);
			regurgMove.damage = regurgDamage;
			if (!target.hp || target.isSemiInvulnerable()) return;
			this.actions.useMove(regurgMove, pokemon);
			return null;
		},
		name: "Regurgitation",
		gen: 6,
		rating: 3,
		num: 27,
		//Description in text file
	},
	shadowcall: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Dark' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Shadow Call boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Dark' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Shadow Call boost');
				return this.chainModify(1.5);
			}
		},
		name: "Shadow Call",
		rating: 2,
		num: 292,
		shortDesc: "Powers up Dark-type moves in a pinch",
	},
	shadowdance: {
		onModifySpe(spe, pokemon) {
			if (this.field.isWeather('newmoon')) {
				return this.chainModify(2);
			}
		},
		name: "Shadow Dance",
		rating: 2,
		num: 293,
		shortDesc: "During intense darkness, the Speed stat of Pokemon with this Ability is doubled.",
	},
	shadowsynergy: {
		onModifyDamage(damage, source, target, move) {
			if (['Dark'].includes(move.type)) {
				this.debug('Shadow Synergy boost');
				return this.chainModify(1.5);
			}
		},
		name: "Shadow Synergy",
		rating: 2,
		num: 294,
		shortDesc: "Boosts the power of the user's Dark-type moves by 50%.",
	},
	spectraljaws: {
		onBasePowerPriority: 7,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['bite']) {
				this.debug('Spectral Jaws Boost');
				return this.chainModify([5325, 4096]);
			}
		},
		onModifyMove(move, pokemon, target) {
			if (move.flags['bite']) {
				this.debug('Spectral Jaws Boost');
				move.category = 'Special';
			}
		},
		name: "Spectral Jaws",
		rating: 1.5,
		num: 296,
		shortDesc: "All biting moves are Special and have a 1.3x Boost",
	},
	spiritcall: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Ghost' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Spirit Call boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Ghost' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Spirit Call boost');
				return this.chainModify(1.5);
			}
		},
		name: "Spirit Call",
		rating: 2,
		num: 291,
		shortDesc: "Powers up Ghost-type moves in a pinch",
	},
	sleet: {
			onImmunity(type, pokemon) {
				if (type === 'hail') return false;
			},
			onStart(source) {
				this.field.setWeather('hail');
			},
			name: "Sleet",
			gen: 6,
			rating: 4,
			num: 36,
			shortDesc: "On switch-in, this Pokemon summons Sleet.",
	},
	speedswap: {
		onStart(source) {
			this.field.addPseudoWeather('trickroom');
		},
		name: "Speed Swap",
		rating: 4,
		num: 226,
		shortDesc: "Activates the Trick Room effect on entering the battlefield.",
	},
	supercell: {
		onUpdate(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Typhlosion' || pokemon.transformed) return;
			let forme = null;
			switch (pokemon.effectiveWeather()) {
			case 'raindance':
			case 'primordialsea':
			case 'newmoon':
				if (pokemon.species.id !== 'typhlosiondeltamegaactive') forme = 'Typhlosion-Delta-Mega-Active';
				break;
			default:
				if (pokemon.species.id !== 'typhlosiondeltamega') forme = 'Typhlosion-Delta-Mega';
				break;
			}
			if (pokemon.isActive && forme) {
				pokemon.formeChange(forme, this.effect, false, '[msg]');
			}
		},
		onModifySpA(SpA, pokemon) {
			if (['raindance', 'primordialsea', 'newmoon'].includes(pokemon.effectiveWeather())) {
				this.debug('Supercell boost');
				return this.chainModify(1.5);
			}
		},
		name: "Supercell",
		rating: 3,
		num: 295,
		shortDesc: "Special Attack surges in the rain and darkness.",
	},
	syntheticalloy: {
		onEffectiveness(typeMod, target, type, move) {
			if (move.type == 'fire') return 0;
		},
		name: "Synthetic Alloy",
		rating: 2,
		num: 28,
		shortDesc: "This Pokemon takes neutral damage from Fire-type attacks.",
	},
	unleafed: {
		onStart(pokemon) {
			pokemon.addVolatile('unleafed');
		},
		onEnd(pokemon) {
			delete pokemon.volatiles['unleafed'];
			this.add('-end', pokemon, 'Unleafed', '[silent]');
		},
		condition: {
			duration: 1,
			durationCallback(pokemon, move) {
				const friends = pokemon.side.pokemon.filter(ally => ally.fainted);
				return friends.length + 1;
			},
			onStart(target) {
				this.add('-start', target, 'ability: Unleafed', '[silent]');
				this.boost({atk: 1}, target);
				this.boost({def: 1}, target);
				this.boost({spa: 1}, target);
				this.boost({spd: 1}, target);		
				this.boost({spe: 1}, target);
			},
			onEnd(target) {
				this.add('-end', target, 'Unleafed', '[silent]');
				this.boost({atk: -1}, target);
				this.boost({def: -1}, target);
				this.boost({spa: -1}, target);
				this.boost({spd: -1}, target);
				this.boost({spe: -1}, target);
			},
		},
		name: "Unleafed",
		rating: 3.5,
		num: 84,
		shortDesc: "On entry, this Pokemon's stats are increased 1 stage for one turn plus another for every fainted party member.",

	},
	vampiric: {
		onAfterMoveSecondarySelf(pokemon, target, move) {
			if (move.flags['contact']) this.heal(pokemon.lastDamage / 4, pokemon);
		},
		name: "Vampiric",
		rating: 3,
		num: 281,
		shortDesc: "Recovers a little HP with contact moves.",
	},
	vaporization: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Water') {
				if (!this.boost({spa: 0})) {
					this.add('-immune', target, '[from] ability: Vaporization');
				}
				return null;
			}
		},
		onResidualOrder: 26,
		onResidualSubOrder: 1,
		onResidual(pokemon) {
			if (!pokemon.hp) return;
			for (const target of pokemon.side.foe.active) {
				if (!target || !target.hp) continue;
				if (target.hasType('Water')) {
					this.damage(target.baseMaxhp / 8, target, pokemon);
				}
			}
			for (const target of pokemon.side.active) {
				if (!target || !target.hp) continue;
				if (target.hasType('Water')) {
					this.damage(target.baseMaxhp / 8, target, pokemon);
				}
			}
		},
		name: "Vaporization",
		rating: 3,
		num: 274,
		shortDesc: "Immune to Water-type Moves and Water-Types lose 1/8 of their max hp while this Pokemon is active.",
	},
	venomous: {
		// The Toxic part of this mechanic is implemented in move that inflict poison under `onModifyMove` in moves.ts
		name: "Venomous",
		rating: 2,
		num: 275,
		shortDesc: "This Pokemon always badly poisons",
	},
	windforce: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Flying') {
				if (!this.boost({spe: 1})) {
					this.add('-immune', target, '[from] ability: Wind Force');
				}
				return null;
			}
		},
		name: "Wind Force",
		rating: 2,
		num: 273,
		shortDesc: "Flying-type moves boost this Pokemon's speed; Flying immunity.",
	},
	winterjoy: {
		onModifyAtk(Atk, pokemon) {
			if (pokemon.hasAbility('winterjoy')) {
				return this.chainModify(.7);
			}
		},
		onModifySpA(spa, pokemon) {
			if (pokemon.hasAbility('winterjoy')) {
				return this.chainModify(.7);
			}
		},
		name: "Winter Joy",
		rating: 3,
		num: 277,
		shortDesc: "Strengthened in winter and weakened in summer.",
	},
	// Uranium
	acceleration: {
		onBasePowerPriority: 30,
		onBasePower(basePower, attacker, defender, move) {
			if (move.priority > 0) {
				return this.chainModify(1.5);
			}
		},
		name: "Acceleration",
		rating: 4,
		num: -108,
		shortDesc: "This Pokemon's priority moves have 1.5x power.",
	},
	atomizate: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) && !(move.isZ && move.category !== 'Status')) {
				move.type = 'Nuclear';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		name: "Atomizate",
		rating: 5,
		num: -110,
		shortDesc: "This Pokemon's Normal-type moves become Nuclear type and have 1.2x power.",
	},
	bloodlust: {
		onAfterMoveSecondarySelf(pokemon, target, move) {
			if (move.flags['contact']) this.heal(pokemon.lastDamage / 6, pokemon);
		},
		name: "Blood Lust",
		rating: 3,
		num: 282,
		shortDesc: "This Pokemon recovers 1/6 of damage dealt when using a contact move.",
	},
	chernobyl: {
		onStart(source) {
		this.field.setWeather('fallout');
		},
		name: "Chernobyl",
		rating: 5,
		num: -118,
		shortDesc: "On switch-in, this Pokemon summons Fallout.",
	},
	deepfreeze: {
		onDamagingHit(damage, target, source, move) {
			if (move.flags['contact']) {
				if (this.randomChance(3, 10)) {
					source.trySetStatus('frz', target);
				}
			}
		},
		name: "Deep Freeze",
		rating: 2,
		num: 285,
		shortDesc: "30% chance a Pokemon making contact with this Pokemon will be frozen.",
	},
	disenchant: {
		onTryHitPriority: 1,
		onTryHit(target, source, move) {
		  if (move.type === 'Fairy') {
			this.add('-immune', target, '[from] ability: Disenchant');
			return null;
		  }
		},
		name: "Disenchant",
		rating: 3,
		num: 287,
		shortDesc: "This Pokemon is immune to Fairy-type attacks.",
	},
	elementalist: {
		onAllyBasePowerPriority: 22,
		onAllyBasePower(basePower, attacker, defender, move) {
			if (move.type === 'Fire' || move.type === 'Water' || move.type === 'Electric') {
				this.debug('Elementalist boost');
				return this.chainModify(1.5);
			}
		},
		name: "Elementalist",
		rating: 3.5,
		num: 288,
		shortDesc: "This Pokemon and its allies' Fire, Water, and Electric-type moves have their power multiplied by 1.5.",
	},
	fallout: {
		onStart(source) {
			this.field.setWeather('wasteland');
		},
		name: "Fallout",
		rating: 4,
		num: 45,
		shortDesc: "On switch-in, this Pokemon creates a Wasteland.",
	},
	geigersense: {
		onStart(pokemon) {
			for (const target of this.getAllActive()) {
				if (target !== pokemon && target.hasType('Nuclear')) {
					this.boost({atk: 1, spa: 1});
					break;
				}
			}
		},
		name: "Geiger Sense",
		rating: 1,
		num: -117,
		shortDesc: "On switch-in, raises Attack and Sp. Atk if another Nuclear-type is on field.",
	},
	infuriate: {
		onDamagingHit(damage, target, source, move) {
			if (move.category === 'Physical') {
				this.boost({atk: 1}, target, target);
			}
		},
		name: "Infuriate",
		rating: 1,
		num: 280,
		shortDesc: "If a physical attack hits this Pokemon, its Attack is raised by 1 stage.",
	},
	lazy: {
		onStart(pokemon) {
      		if (!pokemon.status && pokemon.setStatus('slp', pokemon)) {
        		pokemon.statusState.time = 3;
				pokemon.statusState.startTime = 3;
      		}
		},
		name: "Lazy",
		rating: -1,
		num: -102,
		shortDesc: "On switch-in, this Pokemon falls asleep for 2 turns.",
	},
	leadskin: {
		onImmunity(type, pokemon) {
			if (type === 'fallout') return false;
		},
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Nuclear' && move.category !== 'Status') {
				this.add('-immune', target, '[from] ability: Lead Skin');
				return null;
			}
		},
		name: "Lead Skin",
		flags: {breakable: 1},
		rating: 0.5,
		num: -111,
		shortDesc: "This Pokemon is immune to damaging Nuclear-type moves.",
	},
	petrify: {
		onStart(pokemon) {
			let activated = false;
			for (const target of pokemon.adjacentFoes()) {
				if (!activated) {
					this.add('-ability', pokemon, 'Petrify', 'boost');
					activated = true;
				}
				if (target.volatiles['substitute']) {
					this.add('-immune', target);
				} else {
					this.boost({spe: -1}, target, pokemon, null, true);
				}
			}
		},
		name: "Petrify",
		rating: 3.5,
		num: 284,
		shortDesc: "On switch-in, this Pokemon lowers the Speed of adjacent opponents by 1 stage.",
	},
 	quickcharge: {
        onModifyPriority(priority, pokemon, target, move) {
            if (pokemon.activeMoveActions === 0) {
                return priority + 4;
            }
        },
        name: "Quick Charge",
        rating: 3,
        num: 281,
		shortDesc: "This Pokemon's moves have their priority increased by 4 on its first active turn.",
    },
	rebuild: {
		onStart(pokemon) {
			pokemon.addVolatile('rebuild');
		},
    	condition: {
			onHit(pokemon, source, move) {
				if (move.category !== 'Status') {
					pokemon.volatiles['rebuild'].lostFocus = true;
         			this.debug('Rebuild lost focus');
				}
			},
   		},
		onResidualOrder: 5,
		onResidualSubOrder: 5,
		onResidual(pokemon) {
      		if (pokemon.volatiles['rebuild'] && !pokemon.volatiles['rebuild'].lostFocus) {
        		this.heal(pokemon.baseMaxhp / 8);
      		}
     		 pokemon.volatiles['rebuild'].lostFocus = false;
    	},
		name: "Rebuild",
		rating: 3,
		num: -103,
		shortDesc: "If unhit, this Pokemon heals 1/8 of its max HP each turn.",
	},
	sharpcoral: {
		onBasePowerPriority: 5,
		onBasePower(basePower) {
     		this.debug('Sharp Coral boost');
      		return this.chainModify(2);
		},
		onSourceModifyDamage(damage) {
      		this.debug('Sharp Coral boost');
			return this.chainModify(2);
		},
   		name: "Sharp Coral",
		flags: {breakable: 1},
    	rating: 1,
   		num: -101,
		shortDesc: "This Pokemon's Atk and SpA is doubled, Def and SpD is halved.",
 	},
	soundboost: {
		onBasePowerPriority: 7,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['sound']) {
				this.debug('Sound Boost boost');
				return this.chainModify(1.3);
			}
		},
		name: "Sound Boost",
		rating: 3,
		num: 284,
		shortDesc: "This Pokemon's Sound-based moves are boosted by 1.3x.",
	},
	stormbringer: {
		onStart(source) {
			this.field.setWeather('thunderstorm');
		},
		name: "Stormbringer",
		rating: 4,
		num: 45,
		shortDesc: "On switch-in, this Pokemon summons a Thunderstorm.",
	},
	// Xenoverse
	equalize: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) && !(move.isZ && move.category !== 'Status')) {
				move.type = 'Sound';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		name: "Equalize",
		rating: 4,
		num: 206,
		shortDesc: "This Pokemon's Normal-type moves become Sound type and have 1.2x power.",
	},
	holyguard: {
		onStart(pokemon) {
			let totalatk = 0;
			let totalspa = 0;
			for (const target of pokemon.side.foe.active) {
				if (!target || target.fainted) continue;
				totalatk += target.getStat('atk', false, true);
				totalspa += target.getStat('spa', false, true);
			}
			if (totalatk && totalatk >= totalspa) {
				this.boost({def: 1});
			} else if (totalspa) {
				this.boost({spd: 1});
			}
		},
		name: "Holy Guard",
		rating: 4,
		num: -1035,
		shortDesc: "On switch-in, Defense or Sp. Def is raised 1 stage based on the foes' weaker Attack.",
	},
	piggybank: {
		name: "Piggy Bank",
		rating: 0,
		num: 50,
		shortDesc: "No competitive use.",
	},
	synthesizer: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Sound') {
				if (!this.heal(target.baseMaxhp / 4)) {
					this.add('-immune', target, '[from] ability: Synthisizer');
				}
				return null;
			}
		},
		name: "Synthesizer",
		rating: 3.5,
		num: 11,
		shortDesc: "This Pokemon heals 1/4 of its max HP when hit by Sound moves; Sound immunity.",
	},
	waterstream: {
		onSourceModifyDamage(damage, source, target, move) {
			if (this.queue.willMove(target)) {
				this.debug('Water Stream weaken');

					let ratio = Math.floor(source.getStat('spe') / target.getStat('spe'));
					if (!isFinite(ratio)) ratio = 0;
					const dr = [0, 17.5, 35, 52.5, 70][Math.min(ratio, 4)];
					// pick ratios to match what is requested.
					// first value is if target is faster, but moving second
					this.debug('Damage Reduction: ' + dr);


				return this.chainModify(dr);
			}
		},
		name: "Water Stream",
		rating: 2.5,
		num: 111,
		shortDesc: "This Pokemon receives 1/2 damage from attacks when moving before the foe.",
	},
	//Opalo
	coleoptero: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status') && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Bug';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		flags: {},
		name: "Coleoptero",
		rating: 4,
		num: 206,
		shortDesc: "This Pokemon's Normal-type moves become Bug-type and have 1.2x power.",
	},
	iceberg: {
		onDamage(damage, target, source, effect) {
			if (effect.id === 'recoil') {
				if (!this.activeMove) throw new Error("Battle.activeMove is null");
				if (this.activeMove.id !== 'struggle') return null;
			}
		},
		flags: {},
		name: "Iceberg",
		rating: 3,
		num: 69,
		shortDesc: "This Pokemon does not take recoil damage besides Struggle/Life Orb/crash damage.",
	},
	solstice: {
		onTryHit(target, source, move) {
			if (target !== source && move.category === 'Special') {
				if (!this.boost({spa: 1})) {
					this.add('-immune', target, '[from] ability: Solstice');
				}
				return null;
			}
		},
		name: "Wind Force",
		rating: 2,
		num: 273,
		shortDesc: "Foe's Special moves boost this Pokemon's Sp. Atk; Special move immunity.",
	},
	spectralize: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status') && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Ghost';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		flags: {},
		name: "Spectralize",
		rating: 4,
		num: 206,
		shortDesc: "This Pokemon's Normal-type moves become Ghost-type and have 1.2x power.",
	},
	// Radical Red
	fatalprecision: {
		onBasePowerPriority: 23,
		onBasePower(basePower, attacker, defender, move) {
			if (defender.runEffectiveness(move) > 0) {
				this.debug('Fatal Precision boost');
				return this.chainModify([4915, 4096]);
			}
		},
		onModifyMove(move, pokemon, target) {
			if (target && target.runEffectiveness(move) > 0) {
				move.accuracy = true;
			}
		},
		name: "Fatal Precision",
		rating: 3,
		gen: 8,
		shortDesc: "Super Effective Moves from this Pokemon can’t miss and receive a 20% damage boost.",
	},
	oraoraoraora: {
		onPrepareHit(source, target, move) {
			if (move.category === 'Status' || move.multihit || move.flags['noparentalbond'] || move.flags['charge'] ||
			move.flags['futuremove'] || move.spreadHit || move.isZ || move.isMax) return;
			move.multihit = 2;
			move.multihitType = 'parentalbond';
		},
		// Damage modifier implemented in BattleActions#modifyDamage()
		onSourceModifySecondaries(secondaries, target, source, move) {
			if (move.multihitType === 'parentalbond' && move.id === 'secretpower' && move.hit < 2) {
				// hack to prevent accidentally suppressing King's Rock/Razor Fang
				return secondaries.filter(effect => effect.volatileStatus === 'flinch');
			}
		},
		name: "ORAORAORAORA",
		rating: 3,
		shortDesc: "This Pokémon's punching moves hit twice, with the second hit at half power.",
	},
	purefocus: {
		onModifySpAPriority: 5,
		onModifySpA(SpA) {
			return this.chainModify(2);
		},
		name: "Pure Focus",
		rating: 5,
		num: 37,
		shortDesc: "This Pokemon's Special Attack is doubled.",
	},
	badcompany: {
		onTryBoost(boost, target, source, effect) {
			if (source && target !== source) return;
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! < 0) {
					delete boost[i];
				}
			}
		},
		onModifyMove(move) {
			move.mindBlownRecoil = false;
		},
		onDamage(damage, target, source, effect) {
			if (effect.id === 'recoil') {
				if (!this.activeMove) throw new Error("Battle.activeMove is null");
				if (this.activeMove.id !== 'struggle') return null;
			}
		},
		name: "Bad Company",
		rating: 4,
		gen: 8,
		shortDesc: "Prevents self-lowering stat drops and recoil.",
	},
	parasiticwaste: {
		onModifyMove(move) {
			if (!move.secondaries) move.secondaries = [];
			for (const secondary of move.secondaries) {
				if ((move.category !== 'Status') && (secondary.status === 'psn' || secondary.status === 'tox')) {
					move.drain = [1, 2];
				}
			}
		},
		name: "Parasitic Waste",
		gen: 8,
		rating: 2.5,
		shortDesc: "Attacks that can poison also heal for 50% of the damage dealt.",
	},
	cryoshell: {
		onWeather(target, source, effect) {
			if (effect.id === 'raindance' || effect.id === 'hail') {
				this.heal(target.baseMaxhp / 16);
			}
		},
		onImmunity(type, pokemon) {
			if (type === 'hail') return false;
		},
		name: "Cryo Shell",
		rating: 1,
		num: 279,
		shortDesc: "If Rain or Hail is active, this Pokemon heals 1/16 of its max HP each turn.",
	},
	trickster: {
		//Implemented on moves
		name: "Trickster",
		rating: 4,
		num: 278,
		shortDesc: "When used, Room effects last 2 more turns.",
	},
	raptor: {
		onModifyPriority(priority, pokemon, target, move) {
			target = pokemon.side.foe.pokemon[0];
			if (move.target === 'normal' && target && target.hp <= target.maxhp / 4) 
				return priority + 1;
		},
		name: "Raptor",
		rating: 2,
		num: 271,
		shortDesc: "When the foe reaches 1/4 or less of its max HP, this Pokemon has +1 Priority.",
	},
	majesticaura: {
		onFoeTryMove(target, source, move) {
			const targetAllExceptions = ['perishsong', 'flowershield', 'rototiller'];
			if (move.target === 'foeSide' || (move.target === 'all' && !targetAllExceptions.includes(move.id))) {
				return;
			}

			const dazzlingHolder = this.effectState.target;
			if ((source.isAlly(dazzlingHolder) || move.target === 'all') && move.priority > 0.1) {
				this.attrLastMove('[still]');
				this.add('cant', dazzlingHolder, 'ability: Dazzling', move, '[of] ' + target);
				return false;
			}
		},
		name: "Majestic Aura",
		flags: {breakable: 1},
		rating: 2.5,
		num: 219,
		shortDesc: "While this Pokemon is active, allies are protected from opposing priority moves.",
	},
	proteanmaxima: {
		onAfterMega(pokemon) {
			if (!pokemon.baseSpecies.id.includes('eevee') || !pokemon.species.id.includes('eevee')) {
				return;
			}
			const action = this.queue.willMove(pokemon);
			if (!action) return;
			const move = this.dex.getActiveMove(action.move.id);
			let type = move.type;
			const dict = {
				'Normal': 'Eevee-Mega',
				'Water': 'Eevee-Mega-V',
				'Electric': 'Eevee-Mega-J',
				'Fire': 'Eevee-Mega-F',
				'Psychic': 'Eevee-Mega-E',
				'Dark': 'Eevee-Mega-U',
				'Grass': 'Eevee-Mega-L',
				'Ice': 'Eevee-Mega-G',
				'Fairy': 'Eevee-Mega-S',
			};
			const types = ['Normal', 'Water', 'Electric', 'Fire', 'Psychic', 'Dark', 'Grass', 'Ice', 'Fairy'];

			if (move.id === 'hiddenpower') type = 'Normal';
			if (!types.includes(type)) return;

			const forme = dict[type as keyof typeof dict];
			if (pokemon.species.name === forme) return;
			pokemon.formeChange(forme);
			pokemon.baseMaxhp = Math.floor(Math.floor(
				2 * pokemon.species.baseStats['hp'] + pokemon.set.ivs['hp'] + Math.floor(pokemon.set.evs['hp'] / 4) + 100
			) * pokemon.level / 100 + 10);
			const newMaxHP = pokemon.volatiles['dynamax'] ? (2 * pokemon.baseMaxhp) : pokemon.baseMaxhp;
			pokemon.hp = Math.floor(newMaxHP * (pokemon.hp / pokemon.maxhp));
			pokemon.maxhp = newMaxHP;
		},

		onBeforeTurn(pokemon) {
			if (!pokemon.baseSpecies.id.includes('eevee') || !pokemon.species.id.includes('eevee')) {
				return;
			}
			const action = this.queue.willMove(pokemon);
			if (!action) return;
			const move = this.dex.getActiveMove(action.move.id);
			let type = move.type;
			const dict = {
				'Normal': 'Eevee-Mega',
				'Water': 'Eevee-Mega-V',
				'Electric': 'Eevee-Mega-J',
				'Fire': 'Eevee-Mega-F',
				'Psychic': 'Eevee-Mega-E',
				'Dark': 'Eevee-Mega-U',
				'Grass': 'Eevee-Mega-L',
				'Ice': 'Eevee-Mega-G',
				'Fairy': 'Eevee-Mega-S',
			};
			const types = ['Normal', 'Water', 'Electric', 'Fire', 'Psychic', 'Dark', 'Grass', 'Ice', 'Fairy'];

			if (move.id === 'hiddenpower') type = 'Normal';
			if (!types.includes(type)) return;

			const forme = dict[type as keyof typeof dict];
			if (pokemon.species.name === forme) return;
			pokemon.formeChange(forme);
			pokemon.baseMaxhp = Math.floor(Math.floor(
				2 * pokemon.species.baseStats['hp'] + pokemon.set.ivs['hp'] + Math.floor(pokemon.set.evs['hp'] / 4) + 100
			) * pokemon.level / 100 + 10);
			const newMaxHP = pokemon.volatiles['dynamax'] ? (2 * pokemon.baseMaxhp) : pokemon.baseMaxhp;
			pokemon.hp = Math.floor(newMaxHP * (pokemon.hp / pokemon.maxhp));
			pokemon.maxhp = newMaxHP;
		},

		onTryHit(target, source, move) {
			if (!target.baseSpecies.id.includes('eevee') || !target.species.id.includes('eevee')) {
				return;
			}
			if (target.types[0] === 'Water') {
				if (target !== source && move.type === 'Water') {
					if (!this.heal(target.baseMaxhp / 4)) {
						this.add('-immune', target, '[from] ability: Water Absorb');
					}
					return null;
				}
			}
			if (target.types[0] === 'Fire') {
				if (target !== source && move.type === 'Fire') {
					move.accuracy = true;
					if (!target.addVolatile('flashfire')) {
						this.add('-immune', target, '[from] ability: Flash Fire');
					}
					return null;
				}
			}
			if (target.types[0] === 'Electric') {
				if (target !== source && move.type === 'Electric') {
					if (!this.heal(target.baseMaxhp / 4)) {
						this.add('-immune', target, '[from] ability: Volt Absorb');
					}
					return null;
				}
			}
			if (target.types[0] === 'Psychic') {
				if (target === source || move.hasBounced || !move.flags['reflectable']) {
					return;
				}
				const newMove = this.dex.getActiveMove(move.id);
				newMove.hasBounced = true;
				newMove.pranksterBoosted = false;
				this.actions.useMove(newMove, target, { target: source });
				return null;
			}
		},
		onAllyTryHitSide(target, source, move) {
			if (!target.baseSpecies.id.includes('eevee') || !target.species.id.includes('eevee')) {
				return;
			}
			if (target.types[0] !== 'Psychic') return;
			if (target.side === source.side || move.hasBounced || !move.flags['reflectable']) {
				return;
			}
			const newMove = this.dex.getActiveMove(move.id);
			newMove.hasBounced = true;
			newMove.pranksterBoosted = false;
			this.actions.useMove(newMove, target, { target: source });
			return null;
		},
		onAfterSetStatus(status, target, source, effect) {
			if (!target.baseSpecies.id.includes('eevee') || !target.species.id.includes('eevee')) {
				return;
			}
			if (target.types[0] !== 'Dark') return;
			if (!source || source === target) return;
			if (effect && effect.id === 'toxicspikes') return;
			if (status.id === 'slp' || status.id === 'frz') return;
			this.add('-activate', target, 'ability: Synchronize');
			// Hack to make status-prevention abilities think Synchronize is a status move
			// and show messages when activating against it.
			source.trySetStatus(status, target, {status: status.id, id: 'synchronize'} as Effect);
		},
		onModifySpe(spe, pokemon) {
			if (!pokemon.baseSpecies.id.includes('eevee') || !pokemon.species.id.includes('eevee')) {
				return;
			}
			if (pokemon.types[0] !== 'Grass') return;
			if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(2);
			}
		},
		onImmunity(type, pokemon) {
			if (!pokemon.baseSpecies.id.includes('eevee') || !pokemon.species.id.includes('eevee')) {
				return;
			}
			if (pokemon.types[0] !== 'Ice') return;
			if (type === 'hail') return false;
		},
		onModifyAccuracyPriority: 8,
		onModifyAccuracy(accuracy, pokemon) {
			if (!pokemon.baseSpecies.id.includes('eevee') || !pokemon.species.id.includes('eevee')) {
				return;
			}
			if (pokemon.types[0] !== 'Ice') return;
			if (typeof accuracy !== 'number') return;
			if (this.field.isWeather(['hail', 'snow'])) {
				this.debug('Snow Cloak - decreasing accuracy');
				return accuracy * 0.8;
			}
		},
		onDamagingHit(damage, target, source, move) {
			if (!target.baseSpecies.id.includes('eevee') || !target.species.id.includes('eevee')) {
				return;
			}
			if (target.types[0] !== 'Fairy') return;
			if (this.checkMoveMakesContact(move, source, target)) {
				if (this.randomChance(3, 10)) {
					source.addVolatile('attract', this.effectState.target);
				}
			}
		},
		name: "Protean Maxima",
		gen: 6,
		rating: 4.5,
		num: 25,
	},
	dreadspace: {
		onStart(pokemon) {
			this.add('-ability', pokemon, 'Dread Space');
		},
		onDeductPP(target, source) {
			if (target.isAlly(source)) return;
			return 4;
		},
		name: "Dread Space",
		rating: 2.5,
		num: 46,
	},
	//Untamed
	grimtears: {
		onStart(pokemon) {
			let activated = false;
			for (const target of pokemon.adjacentFoes()) {
				if (!activated) {
					this.add('-ability', pokemon, 'Grim Tears', 'boost');
					activated = true;
				}
				if (target.volatiles['substitute']) {
					this.add('-immune', target);
				} else {
					this.boost({spa: -1}, target, pokemon, null, true);
				}
			}
		},
		name: "Grim Tears",
		rating: 3.5,
		num: 269,
		shortDesc: "On switch-in, this Pokemon lowers the Sp. Atk of adjacent opponents by 1 stage.",
	},
	microstrike: {
		onBasePowerPriority: 19,
		onBasePower(basePower, pokemon, target, move) {
			const targetWeight = target.getWeight();
			const pokemonWeight = pokemon.getWeight();
			if (pokemonWeight <= targetWeight) {
				return this.chainModify(1.2);
			}
		},
		name: "Micro Strike",
		rating: 3,
		num: 173,
		shortDesc: "This Pokemon's attacks against heavier foes do 1.2x damage.",
	},
	baitedline: {
		onFoeTrapPokemon(pokemon) {
			if (pokemon.hasType('Water') && pokemon.isAdjacent(this.effectState.target)) {
				pokemon.tryTrap(true);
			}
		},
		onFoeMaybeTrapPokemon(pokemon, source) {
			if (!source) source = this.effectState.target;
			if (!source || !pokemon.isAdjacent(source)) return;
			if (!pokemon.knownType || pokemon.hasType('Water')) {
				pokemon.maybeTrapped = true;
			}
		},
		name: "Baited Line",
		rating: 4,
		num: 42,
		shortDesc: "Prevents adjacent Water-type foes from choosing to switch.",
	},
	crystaljaw: {
		onModifyMove(move, pokemon, target) {
			if (move.flags['bite']) {
				this.debug('Spectral Jaws Boost');
				move.category = 'Special';
			}
		},
		onBasePowerPriority: 19,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['bite']) {
				return this.chainModify(1.3);
			}
		},
		name: "Crystal Jaw",
		rating: 1.5,
		num: 296,
		shortDesc: "All biting moves become Special.",
	},
	junglefury: {
		onModifyCritRatio(critRatio, source, target) {
			if (this.field.isTerrain('grassyterrain')) {
				return critRatio + 2;
			}
		},
		name: "Jungle Fury",
		rating: 1.5,
		num: 196,
		shortDesc: "If Grassy Terrain is active, this Pokemon's critical hit ratio is raised by 1 stage.",
	},
	momentum: {
		onStart(pokemon) {
			pokemon.addVolatile('momentum');
		},
		condition: {
			onStart(pokemon) {
				this.effectState.lastMove = '';
				this.effectState.numConsecutive = 0;
			},
			onTryMovePriority: -2,
			onTryMove(pokemon, target, move) {
				if (!pokemon.hasAbility('momentum')) {
					pokemon.removeVolatile('momentum');
					return;
				}
				if (this.effectState.lastMove === move.id && pokemon.moveLastTurnResult) {
					this.effectState.numConsecutive++;
				} else if (pokemon.volatiles['twoturnmove'] && this.effectState.lastMove !== move.id) {
					this.effectState.numConsecutive = 1;
				} else {
					this.effectState.numConsecutive = 0;
				}
				this.effectState.lastMove = move.id;
			},
			onModifyDamage(damage, source, target, move) {
				const dmgMod = [4096, 4915, 5734, 6553, 7372, 8192];
				const numConsecutive = this.effectState.numConsecutive > 5 ? 5 : this.effectState.numConsecutive;
				this.debug(`Current Momentum boost: ${dmgMod[numConsecutive]}/4096`);
				return this.chainModify([dmgMod[numConsecutive], 4096]);
			},
		},
		name: "Momentum",
		rating: 4.5,
		num: 21,
		shortDesc: "Consecutively using the same move increases its damage.",
	},
	warriorspirit: {
		onBasePowerPriority: 23,
		onBasePower(basePower, attacker, defender, move) {
			if (defender.runEffectiveness(move) > 0) {
				this.debug('Warrior Spirit boost');
				return this.chainModify(1.5);
			}
		},
		name: "Warrior Spirit",
		rating: 3,
		gen: 8,
		shortDesc: "Super Effective Moves from this Pokemon recieve 1.5x damage boost.",
	},
	slipperypeel: {
  		onSwitchIn(pokemon) {
   			pokemon.slipped = false;
    		pokemon.usedSlipperyPeel = false; // Add this line to track activation
  		},
  		onDamagingHit(damage, target, source, move) {
  			if (target.usedSlipperyPeel || source.slipped) return;
   			if (!this.checkMoveMakesContact(move, source, target)) return;
    		if (!this.canSwitch(source.side) || source.forceSwitchFlag || target.forceSwitchFlag) return;
    		if (this.runEvent('DragOut', source, target, move)) {
      			this.add('-activate', target, 'ability: Slippery Peel');
      			source.forceSwitchFlag = true;
      			source.slipped = true;
      			target.usedSlipperyPeel = true; // Set the flag to true after activation
    		}
 		},
  		name: "Slippery Peel",
  		rating: 1,
  		num: 194,
	},
	seance: {
		onAllyFaint(target) {
			if (!this.effectState.target.hp) return;
			const ability = target.getAbility();
			const additionalBannedAbilities = [
				'noability', 'flowergift', 'forecast', 'hungerswitch', 'illusion', 'imposter', 'neutralizinggas', 'powerofalchemy', 'receiver', 'trace', 'wonderguard',
			];
			if (additionalBannedAbilities.includes(target.ability)) return;
			this.add('-ability', this.effectState.target, ability, '[from] ability: Receiver', '[of] ' + target);
			this.effectState.target.setAbility(ability);
		},
		onFoeFaint(target) {
			if (!this.effectState.target.hp) return;
			const ability = target.getAbility();
			const additionalBannedAbilities = [
				'noability', 'flowergift', 'forecast', 'hungerswitch', 'illusion', 'imposter', 'neutralizinggas', 'powerofalchemy', 'receiver', 'trace', 'wonderguard',
			];
			if (additionalBannedAbilities.includes(target.ability)) return;
			this.add('-ability', this.effectState.target, ability, '[from] ability: Receiver', '[of] ' + target);
			this.effectState.target.setAbility(ability);
		},
		name: "Seance",
		rating: 0,
		num: 222,
		//Description in text file
	},
	fervor: {
		onAfterMoveSecondarySelf(pokemon, target, move) {
			if (this.effectState.fervor) return;
				if (move.flags['contact']) {
					this.effectState.fervor = true;
					this.boost({spe: 1.5}, pokemon);
				}
		},
		onSwitchIn(pokemon) {
			delete this.effectState.fervor;
		},
		name: "Fervor",
		rating: 4,
		num: 282,
		shortDesc: "This Pokemon's Speed icreases by 2 after using a contact move. Once per switch-in.",
	},
	//Blazing Emerald
	elusive: {
		onModifyAccuracyPriority: 10,
		onModifyAccuracy(accuracy, target, source, move) {
			if (move.category === 'Status' && typeof accuracy === 'number') {
				this.debug('Wonder Skin - setting accuracy to 50');
				return 50;
			}
		},
		name: "Elusive",
		flags: {breakable: 1},
		rating: 2,
		num: 147,
		shortDesc: "Status moves with accuracy checks are 50% accurate when used on this Pokemon.",
	},
	skyscourge: {
		onStart(source) {
			this.field.setWeather('eclipse');
		},
		flags: {},
		name: "Sky Scourge",
		rating: 4,
		num: 1000,
	},
	ambush: {
		onSourceModifyAccuracyPriority: 9,
		onSourceModifyAccuracy(accuracy) {
			if (this.field.isWeather('newmoon')) {
				if (typeof accuracy !== 'number') return;
				this.debug('Ambush - enhancing accuracy');
				return this.chainModify(1.5);
			}
		},
		name: "Ambush",
		rating: 3,
		num: 1034,
		shortDesc: "During Darkness, this Pokemon' has 1.5x Accuacy.",
	},
	barbednest: {
		onSourceModifyDamage(damage, source, target, move) {
			let mod = 1;
			if (move.flags['contact']) mod /= 2;
			if (move.type === 'Fire') mod *= 2;
			return this.chainModify(mod);
		},
		onDamagingHitOrder: 1,
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target, true)) {
				this.damage(source.baseMaxhp / 8, source, target);
			}
		},
		name: "Barbed Nest",
		flags: {breakable: 1},
		rating: 3.5,
		num: 218,
		shortDesc: "Pokemon making contact with this Pokemon lose 1/8 max HP and this Pokemon takes 1/2 damage.",
	},
	crystalcase: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Water') {
					this.add('-immune', target, '[from] ability: Crystal Case');
				}
				return null;
		},
		onSourceBasePowerPriority: 17,
		onSourceBasePower(basePower, attacker, defender, move) {
			if (move.type === 'Fire') {
				return this.chainModify(1.5);
			}
		},
		onDamagingHit(damage, target, source, move) {
			if (['Fire'].includes(move.type)) {
				this.boost({spa: 2});
			}
		},
		name: "Crystal Case",
		flags: {breakable: 1},
		rating: 3,
		num: 87,
		shortDesc: "This Pokemon is immune Water moves. Recieves 1.5x Damage and +2 Sp. Atk from Fire moves.",
	},
	empathy: {
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target, true)) {
				this.add('-ability', target, 'Empathy');
				this.boost({atk: -1, spa: -1}, source, target, null, true);
			}
		},
		name: "Empathy",
		rating: 2,
		num: 183,
		shortDesc: "Pokemon making contact with this Pokemon have their Attack and Sp. Atk lowered by 1 stage.",
	},
	foulshroud: {
		onModifyAccuracyPriority: -1,
		onModifyAccuracy(accuracy) {
			if (typeof accuracy !== 'number') return;
			if (this.field.isWeather('newmoon')) {
				this.debug('Foul Shroud - decreasing accuracy');
				return this.chainModify([3277, 4096]);
			}
		},
		name: "Fould Shroud",
		flags: {breakable: 1},
		rating: 1.5,
		num: 8,
		shortDesc: "During Darkness, this Pokemon's evasiveness is 1.25x.",
	},
	levinskin: {
		onDamagingHit(damage, target, source, move) {
			if (['Electric'].includes(move.type)) {
				this.boost({atk: 2});
			}
		},
		name: "Levin Skin",
		rating: 2,
		num: 243,
		shortDesc: "This Pokemon sharply raises its Attack when hit by Electric moves.",
	},
	resolute: {
		onTryHit(pokemon, target, move) {
			if (move.ohko) {
				this.add('-immune', pokemon, '[from] ability: Resolute');
				return null;
			}
		},
		onDamagePriority: -30,
		onDamage(damage, target, source, effect) {
			if (target.hp === target.maxhp && damage >= target.hp && effect && effect.effectType === 'Move') {
				this.add('-ability', target, 'Resolute');
				return target.hp - 1;
			}
		},
		flags: {breakable: 1},
		name: "Resolute",
		rating: 3,
		num: 5,
		//Descritpion in text file
	},
	siegedrive: {
    	onBasePowerPriority: 23,
   		onBasePower(basePower, attacker, defender, move) {
     		if (move.flags['bullet'] || move.id === 'windblast') {
      			this.debug('Siege Drive boost');
      			return this.chainModify(1.5);
     		}
   		},
   		name: "Siege Drive",
   		rating: 3,
   		num: 1013,
		shortDesc: "This Pokemon's ballistic attacks have 1.5x power.",
 	},
	tactician: {
		onModifyDamage(damage, source, target, move) {
			if (target.getMoveHitData(move).typeMod < 0) {
				this.debug('Tactician boost');
				return this.chainModify(2);
			}
		},
		name: "Tactician",
		rating: 4,
		num: 110,
		shortDesc: "This Pokemon's attacks that are not very effective on a target deal double damage.",
	},
	//Also Untamed need to move these
	freezeover: {
		onStart(source) {
			if (source?.hasItem('icyrock')) {
				this.field.setWeather('hail');
			}
		},
		onResidualOrder: 29,
		onResidual(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Croacrozen' || pokemon.transformed) {
				return;
			}
			if (this.field.isWeather('hail') && !['Frozen'].includes(pokemon.species.forme)) {
				pokemon.addVolatile('freezeover');
			} else if (['Frozen'].includes(pokemon.species.forme)) {
				pokemon.addVolatile('freezeover'); // in case of base Croacrozen-Frozen
				pokemon.removeVolatile('freezeover');
			}
		},
		onEnd(pokemon) {
			if (!pokemon.volatiles['freezeover'] || !pokemon.hp) return;
			pokemon.transformed = false;
			delete pokemon.volatiles['freezeover'];
			if (pokemon.species.baseSpecies === 'Croacrozen' && pokemon.species.battleOnly) {
				pokemon.formeChange(pokemon.species.battleOnly as string, this.effect, false, '[silent]');
			}
		},
		condition: {
			onStart(pokemon) {
				if (!pokemon.species.name.includes('Galar')) {
					if (pokemon.species.id !== 'croacrozenfrozen') pokemon.formeChange('Croacrozen-Frozen');
				}
			},
			onEnd(pokemon) {
				if (['Frozen'].includes(pokemon.species.forme)) {
					pokemon.formeChange(pokemon.species.battleOnly as string);
				}
			},
		},
		name: "Freeze Over",
		flags: {failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1},
		num: 161,
	},
	partypopper: {
  		onFaint(self) {
    		self.side.addSlotCondition(self, "partypopper");
 		},
  		//slotCondition: 'partypopper',
  		condition: {
    		onStart(pokemon) {
     			this.effectState.healAmount = Math.floor(pokemon.maxhp / 2);
   			},
   			onDamagingHitOrder: 2,
			onDamagingHit(damage, target, source, move) {
				    if (!target.hp) {
       				const healAmount = this.effectState.healAmount;
       				target.heal(healAmount);
        			target.setStatus('');
        			this.add('-heal', target, target.getHealth, '[from] ability: Party Popper');
        			target.side.removeSlotCondition(target, 'partypopper');
   		  		}
   		 	},
  		},
  		name: "Party Popper",
	 	rating: 4,
 		num: 110,
 	 	shortDesc: "When this Pokemon faints. Next hurt Pokemon is fully healed.",
 	 	//heal: "  The candy healed [POKEMON]!",
	},
	carpenter: {
		onAllyBasePowerPriority: 22,
		onAllyBasePower(basePower, attacker, defender, move) {
			if (move.type === 'Rock' || move.type === 'Grass' || move.type === 'Steel') {
				this.debug('Carpenter boost');
				return this.chainModify(1.3);
			}
		},
		name: "Carpenter",
		rating: 3.5,
		num: 252,
		shortDesc: "This Pokemon and its allies' Steel, Grass and Rock-type moves have 1.3x power.",
	},
	healingsun: {
		onWeather(target, source, effect) {
			if (effect.id === 'sunnyday') {
				this.heal(target.baseMaxhp / 16);
			}
		},
		name: "Healing Sun",
		rating: 1,
		num: 115,
		shortDesc: "This Pokemon and its allies' Steel, Grass and Rock-type moves have 1.3x power.",
	},
	/*
	if opponent.hasWorkingAbility(:CREAMSHIELD) && opponent.hp > 0 && !attacker.hasMoldBreaker

	//1
	opp_perc = opponent.hp.to_f/opponent.totalhp.to_f * 100
	finalres = (opp_perc).floor
	reduction = 70.0/100.0 * finalres

	//2
	reduction = (100 - reduction).floor
	damagemult = (damagemult * reduction/100.0).floor


	PBDebug.log("[CREAMSHIELD] DAMAGE MODIFIED BY #{reduction/100.0}")
end
(In game Xenoverse code for Cream Shield because I don't think mine is good enough to explain how this all works) */

	//on modfy attack
	creamshield: {
		onSourceModifyDamage(damage, source, target, move) {
				this.debug('Water Stream weaken');
					let  dr = 0.7*(source.hp/source.maxhp)*100 //1
					dr = (100-dr)/100 //2
				return this.chainModify(dr);
		},
		name: "Cream Shield",
		rating: 2.5,
		num: 999,
	},
	solarprominence: {
		onSourceModifyDamage(damage, source, target, effect) {
			if (effect.effectType == 'Move') {
				return this.chainModify(0.7);
			}
		},
		name: "Solar Prominence",
		rating: 0,
		num: 1000,
		shortDesc: "This Pokemon receives 30% less damage from opposing attacks",
	},
	titan: {
		// Titan's type adding is implemented in conditions.js
		name: "Titan",
		flags: {failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1},
		rating: 0,
		num: 1001,
	},
	mysticwind: {
		onSourceModifyDamage(damage, source, target, move) {
			let mod = 1;
			if (move.type === 'Fighting' ||move.type === 'Bug' ||move.type === 'Dark') mod /= 2;
			return this.chainModify(mod);
		},
		onTryHitPriority: 1,
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Dragon') {
					this.add('-immune', target, '[from] ability: Mystic Wind');
				return null;
			}
		},
		name: "Mystic Wind",
		flags: {breakable: 1},
		rating: 0,
		num: 1002,
		shortDesc: "This Pokemon gains the Fairy-Type defensivley excluding weaknesses.",
	},
	cloudburst: {
		//copy of zen mode, but for rapidash-x-storm
		onResidualOrder: 29,
		onResidual(pokemon) {
			if (pokemon.baseSpecies.baseSpecies !== 'Rapidash' || pokemon.transformed) {
				return;
			}
			if (pokemon.hp <= pokemon.maxhp / 2 && !['X-Storm'].includes(pokemon.species.forme)) {
				pokemon.addVolatile('stormform');
			} else if (pokemon.hp > pokemon.maxhp / 2 && ['X-Storm'].includes(pokemon.species.forme)) {
				pokemon.addVolatile('stormform');
				pokemon.removeVolatile('stormform');
			}
		},
		onEnd(pokemon) {
			if (!pokemon.volatiles['stormform'] || !pokemon.hp) return;
			pokemon.transformed = false;
			delete pokemon.volatiles['stormform'];
			if (pokemon.species.baseSpecies === 'Rapidash-X' && pokemon.species.battleOnly) {
				const species: Species = {
					num: 52,
					name: "Rapidash-X",
					baseSpecies: "Rapidash",
					baseForme: "X",
					forme: "X",
					types: ["Flying"],
					baseStats: {hp: 65, atk: 90, def: 70, spa: 80, spd: 80, spe: 115},
					abilities: {0: "Cloud Burst"},
					requiredAbility: "Cloud Burst",
					battleOnly: "Rapidash-X",
					prevo: "",
					heightm: 1.7,
					weightkg: 90,
					color: "White",
					eggGroups: ["Field"],
					effectType: 'Pokemon',
					id: this.toID("Rapidash-X"),
					nfe: false,
					spriteid: (this.toID("Rapidash-X")),
					canHatch: false,
					gender: '',
					genderRatio: {M: 0.5, F: 0.5},
					bst: 500,
					weighthg: 900,
					tags: [],
					unreleasedHidden: false,
					maleOnlyHidden: false,
					tier: "OU",
					doublesTier: "(DOU)",
					natDexTier: "(OU)",
					fullname: "Rapidash-X",
					gen: 9,
					shortDesc: "ignore",
					desc: "ignore this",
					exists: true,
					isNonstandard: null,
					noCopy: false,
					affectsFainted: false,
					sourceEffect: "magic",
					evos: [],
				};
				pokemon.setSpecies(species, this.dex.abilities.getByID(pokemon.ability));
				const stats = this.spreadModify(species.baseStats, pokemon.set);
				pokemon.setType(species.types, true);
				pokemon.apparentType = species.types.join('/');
				pokemon.addedType = species.addedType || '';
				pokemon.knownType = true;
				pokemon.weighthg = species.weighthg;

				pokemon.baseStoredStats = stats;
				let statName: StatIDExceptHP;
				for (statName in pokemon.storedStats) {
					pokemon.storedStats[statName] = stats[statName];
					if (pokemon.modifiedStats) pokemon.modifiedStats[statName] = stats[statName]; // Gen 1: Reset modified stats.
				}
				pokemon.speed = pokemon.storedStats.spe;

				pokemon.details = species.name + (pokemon.level === 100 ? '' : ', L' + pokemon.level) +
					(pokemon.gender === '' ? '' : ', ' + pokemon.gender) + (pokemon.set.shiny ? ', shiny' : '');
				let details = pokemon.details;
				if (pokemon.terastallized) details += `, tera:${pokemon.terastallized}`;
				this.add('detailschange', pokemon, details);
				// pokemon.formeChange(pokemon.species.battleOnly as string, this.effect, false, '[silent]'); showdown doesn't do this for custom mon
			}
		},
		condition: {
			onStart(pokemon) {
				const species: Species = {
					num: 52,
					name: "Rapidash-X-Storm",
					baseSpecies: "Rapidash",
					baseForme: "X",
					forme: "X-Storm",
					types: ["Electric", "Flying"],
					baseStats: {hp: 65, atk: 80, def: 70, spa: 140, spd: 60, spe: 145},
					abilities: {0: "Cloud Burst"},
					requiredAbility: "Cloud Burst",
					battleOnly: "Rapidash-X",
					prevo: "",
					heightm: 1.7,
					weightkg: 90,
					color: "White",
					eggGroups: ["Field"],
					effectType: 'Pokemon',
					id: this.toID("Rapidash-X-Storm"),
					nfe: false,
					spriteid: (this.toID("Rapidash-X-Storm")),
					canHatch: false,
					gender: '',
					genderRatio: {M: 0.5, F: 0.5},
					bst: 560,
					weighthg: 900,
					tags: [],
					unreleasedHidden: false,
					maleOnlyHidden: false,
					tier: "OU",
					doublesTier: "(DOU)",
					natDexTier: "(OU)",
					fullname: "Rapidash-X-Storm",
					gen: 9,
					shortDesc: "ignore",
					desc: "ignore this",
					exists: true,
					isNonstandard: null,
					noCopy: false,
					affectsFainted: false,
					sourceEffect: "magic",
					evos: [],
				};
				pokemon.setSpecies(species, this.dex.abilities.getByID(pokemon.ability));
				const stats = this.spreadModify(species.baseStats, pokemon.set);
				pokemon.setType(species.types, true);
				pokemon.apparentType = species.types.join('/');
				pokemon.addedType = species.addedType || '';
				pokemon.knownType = true;
				pokemon.weighthg = species.weighthg;

				pokemon.baseStoredStats = stats;
				let statName: StatIDExceptHP;
				for (statName in pokemon.storedStats) {
					pokemon.storedStats[statName] = stats[statName];
					if (pokemon.modifiedStats) pokemon.modifiedStats[statName] = stats[statName]; // Gen 1: Reset modified stats.
				}
				pokemon.speed = pokemon.storedStats.spe;

				pokemon.details = species.name + (pokemon.level === 100 ? '' : ', L' + pokemon.level) +
					(pokemon.gender === '' ? '' : ', ' + pokemon.gender) + (pokemon.set.shiny ? ', shiny' : '');
				let details = pokemon.details;
				if (pokemon.terastallized) details += `, tera:${pokemon.terastallized}`;
				this.add('detailschange', pokemon, details);
				// pokemon.formeChange('Rapidash-X-Storm'); Showdown doesn't do this for custom mon.
			},
			onEnd(pokemon) {
				if (['X-Storm'].includes(pokemon.species.forme)) {
					const species: Species = {
						num: 52,
						name: "Rapidash-X",
						baseSpecies: "Rapidash",
						baseForme: "X",
						forme: "X",
						types: ["Flying"],
						baseStats: {hp: 65, atk: 90, def: 70, spa: 80, spd: 80, spe: 115},
						abilities: {0: "Cloud Burst"},
						requiredAbility: "Cloud Burst",
						battleOnly: "Rapidash-X",
						prevo: "",
						heightm: 1.7,
						weightkg: 90,
						color: "White",
						eggGroups: ["Field"],
						effectType: 'Pokemon',
						id: this.toID("Rapidash-X"),
						nfe: false,
						spriteid: (this.toID("Rapidash-X")),
						canHatch: false,
						gender: '',
						genderRatio: {M: 0.5, F: 0.5},
						bst: 500,
						weighthg: 900,
						tags: [],
						unreleasedHidden: false,
						maleOnlyHidden: false,
						tier: "OU",
						doublesTier: "(DOU)",
						natDexTier: "(OU)",
						fullname: "Rapidash-X",
						gen: 9,
						shortDesc: "ignore",
						desc: "ignore this",
						exists: true,
						isNonstandard: null,
						noCopy: false,
						affectsFainted: false,
						sourceEffect: "magic",
						evos: [],
					};
					pokemon.setSpecies(species, this.dex.abilities.getByID(pokemon.ability));
					const stats = this.spreadModify(species.baseStats, pokemon.set);
					pokemon.setType(species.types, true);
					pokemon.apparentType = species.types.join('/');
					pokemon.addedType = species.addedType || '';
					pokemon.knownType = true;
					pokemon.weighthg = species.weighthg;
	
					pokemon.baseStoredStats = stats;
					let statName: StatIDExceptHP;
					for (statName in pokemon.storedStats) {
						pokemon.storedStats[statName] = stats[statName];
						if (pokemon.modifiedStats) pokemon.modifiedStats[statName] = stats[statName]; // Gen 1: Reset modified stats.
					}
					pokemon.speed = pokemon.storedStats.spe;
	
					pokemon.details = species.name + (pokemon.level === 100 ? '' : ', L' + pokemon.level) +
						(pokemon.gender === '' ? '' : ', ' + pokemon.gender) + (pokemon.set.shiny ? ', shiny' : '');
					let details = pokemon.details;
					if (pokemon.terastallized) details += `, tera:${pokemon.terastallized}`;
					this.add('detailschange', pokemon, details);
					// pokemon.formeChange(pokemon.species.battleOnly as string); showdown doensn't support this for custom mon
				}
			},
		},
		flags: {failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1},
		name: "Cloud Burst",
		rating: 0,
		num: 1003,
	},
	artillerist: {
		onBasePowerPriority: 19,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['bullet']) {
				this.debug('Artillery boost');
				return this.chainModify(1.5);
			}
		},
		name: "Artillerist",
		rating: 0,
		num: 1004,
		shortDesc: "This Pokemon's ballistic attacks have 1.5x power.",
	},
	blademaster: {
		onBasePowerPriority: 23,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['slicing']) {
				this.debug('Blademaster boost');
				return this.chainModify([1.2]);
			}
		},
		onModifyCritRatio(critRatio, source, target, move: ActiveMove) {
			if (move.flags['slicing']) {
				return (critRatio + 1);
			}
		},
		name: "Blademaster",
		rating: 3.5,
		shortDesc: "Slash attacks have 1.2x power and +1 crit ratio.",
	},
	voltaticspirit: {
		//Boost Electric type moves by 1.5x

		onBasePowerPriority: 19,
		onBasePower(basePower, attacker, defender, move) {
			if (move.type ==="Electric") {
				this.debug('Voltatic Spirit boost');
				return this.chainModify(1.5);
			}
		},
		name: "Voltatic Spirit",
		rating: 0,
		num: 1005,
		shortDesc: "Electric moves used by this Pokemon have 1.5x power.",
	},
	overwrite: {
		//Does this need to behave the same as arceus?
		onStart(source){
			const type = this.dex.moves.get(source.moveSlots[0].id).type;
			if (source.hasType(type) || !source.setType(type)) return false;
			this.add('-start', source, 'typechange', type);
		},
		
		name: "Overwrite",
		rating: 0,
		num: 1006,
		shortDesc: "This Pokemon's type changes to the type of the move in it's first slot.",
	},
	presage: {
		//Sig ability of Casform in Untamed, changes the weather for the turn before attacking. Fire equals Sun, Water equals Rain, Ice equals Hail, ask Untamed devs for the rest later idr atm
		onBeforeMovePriority: 9,
		onBeforeMove(pokemon,target,move) {
			switch(move.type){
				case "fire": this.field.setWeather('sunnyday');;
				case "water": this.field.setWeather('raindance');;
				case "ice": this.field.setWeather('snow');;
				/*
				case "rock": this.field.setWeather('sandstorm');;

				*/
			}

		},
		name: "Presage",
		rating: 0,
		num: 1007,
	},
	thermocool: {
		//Boost Ice type moves by 1.5x in sunshine
		// Damage boost in Sun applied in conditions.ts
			//like hydro steam, boost isn't applied to desolate land
		name: "Thermocool",
		rating: 0,
		num: 1008,
	},
	thermoheat: {
		//Boost Fire type moves by 1.5x in snow and hail
		// Damage boost in snow/hail applied in conditions.ts
		name: "Thermoheat",
		rating: 0,
		num: 1009,
	},
	premonition: {
		//Stab moves hit twice weaker(Parental Bond) Boosts Future Sight by 1.5x?
		onBeforeMove(source, target, move) {
			if (move.category === 'Status' || move.multihit || move.flags['noparentalbond'] || move.flags['charge'] || move.basePower === 0 ||
			move.flags['futuremove'] || move.spreadHit || move.isZ || move.isMax || move.target !=='normal' || !source.types.includes(move.type)) return;
			if (!target.side.addSlotCondition(target, 'futuremove')) return false;
			Object.assign(target.side.slotConditions[target.position]['futuremove'], {
				duration: 3,
				move: move.id,
				source: source,
				moveData: {
					id: move.id,
					name: move.name,
					accuracy: move.accuracy,
					basePower: move.basePower / 2,
					category: move.category,
					priority: 0,
					flags: {...move.flags, allyanim: 1, futuremove: 1},
					ignoreImmunity: false,
					effectType: 'Move',
					type: move.type,
					thawsTarget: move.thawsTarget,
					forceSwitch: move.forceSwitch,
					breaksProtect: move.breaksProtect,
					overrideOffensivePokemon: move.overrideOffensivePokemon,
					overrideOffensiveStat: move.overrideOffensiveStat,
					overrideDefensivePokemon: move.overrideDefensivePokemon,
					overrideDefensiveStat: move.overrideDefensiveStat,
					ignoreAbility: move.ignoreAbility,
					ignoreAccuracy: move.ignoreAccuracy,
					ignoreDefensive: move.ignoreDefensive,
					ignoreEvasion: move.ignoreEvasion,
					ignoreNegativeOffensive: move.ignoreNegativeOffensive,
					ignoreOffensive: move.ignoreOffensive,
					ignorePositiveDefensive: move.ignorePositiveDefensive,
					ignorePositiveEvasion: move.ignorePositiveEvasion,
					willCrit: move.willCrit,
				},
			});
			this.add('-start', source, `move: ${move.name}`);
		},
		onModifyMove(move, pokemon, target) { //!!!!! Make sure to test this part
			if(move.id === this.toID("futuresight") || move.id === this.toID("doomdesire")) {
				move.basePower = move.basePower*1.5;
			}
		},
		flags: {},
		name: "Premonition",
		rating: 4.5,
		num: 185,
		shortDesc: "This Pokémon's STAB moves hit twice, with the second hit at half power. Future Sight has 1.5x Power",
	},
	amalgam: {
		onPrepareHit(source, target, move) {
			if (this.effectState.amalgam) return; //remove this for gen 6
			if (move.hasBounced || move.flags['futuremove'] || move.sourceEffect === 'snatch') return;
			const type = move.type;
			if (type && type !== '???' && source.getTypes().join() !== type) {
				if (!source.setType(type)) return;
				this.effectState.amalgam = true; //remove this for gen 6
				this.add('-start', source, 'typechange', type, '[from] ability: amalgam');
			}
		},
		onSwitchIn() { //remove this for gen 6
			delete this.effectState.amalgam;
		},
		flags: {},
		name: "Amalgam",
		rating: 4,
		num: 236,
		shortDesc: "This Pokemon's type changes to match the type of the move it is about to use.",
	},
	fruitrition: {
		onTryHeal(damage, target, source, effect) {
			if (!effect) return;
			if (target === source) return this.chainModify(1.25);
		},
		flags: {},
		name: "Fruitrition",
		rating: 2,
		num: -1100,
		shortDesc: "This Pokemon's self recovery moves heal an extra 25%.",
	},
	//sage
	adrenaline: {
		onAfterMoveSecondary(target, source, move) {
			if (!source || source === target || !target.hp || !move.totalDamage) return;
			const lastAttackedBy = target.getLastAttackedBy();
			if (!lastAttackedBy) return;
			const damage = move.multihit ? move.totalDamage : lastAttackedBy.damage;
			if (target.hp <= target.maxhp / 2 && target.hp + damage > target.maxhp / 2) {
				this.boost({spe: 1});
			}
		},
		name: "Adrenaline",
		rating: 2,
		num: 201,
		shortDesc: "This Pokemon's Speed is raised by 1 when it reaches 1/2 or less of its max HP.",
	},
	artillery: {
    	onBasePowerPriority: 23,
    	onBasePower(basePower, attacker, defender, move) {
     		if (move.flags['bullet'] || move.id === 'windblast') {
        		this.debug('Artillery boost');
      			return this.chainModify(1.2);
     		 }
    	},
   		name: "Artillery",
   		rating: 3,
    	num: 1013,
		shortDesc: "This Pokemon's ballistic attacks have 1.2x power.",
  	},
  	braveheart: {
		onFoeAfterBoost(boost, target, source, sourceEffect) {
 			const isPositiveBoost = Object.values(boost).some(v => v > 0);
			 if (sourceEffect.effectType !== 'Move' || target !== source || !isPositiveBoost) return;
 			this.boost({atk: 1}, this.effectState.target, this.effectState.target);
		},
		name: "Brave Heart",
		rating: 2,
		num: 24,
		shortDesc: "This Pokemon's Attack is raised 1 stage when the foe raises a stat.",
	},
	conditioning: {
		onStart(pokemon) {
			pokemon.addVolatile("conditioning");
		},
		condition: {
			onStart(pokemon) {
				this.effectState.lastMove = "";
				this.effectState.numConsecutive = 0;
			},
			onHitPriority: -2,
			onHit(pokemon, source, move) {
				if (
					this.effectState.lastMove === move.id &&
					pokemon.moveLastTurnResult
				) {
					this.effectState.numConsecutive++;
				} else if (pokemon.volatiles["twoturnmove"]) {
					if (this.effectState.lastMove !== move.id) {
						this.effectState.numConsecutive = 1;
					} else {
						this.effectState.numConsecutive++;
					}
				} else {
					this.effectState.numConsecutive = 0;
				}
				this.effectState.lastMove = move.id;
			},
		onSourceModifyDamage(damage, source, target, move) {
				const dmgMod = [4096, 3072, 2304, 1728, 1296, 972];
				const numConsecutive =
					this.effectState.numConsecutive > 5 ?
						5 :
						this.effectState.numConsecutive;
				this.debug(
					`Current Conditioning boost: ${dmgMod[numConsecutive]}/4096`
				);
				return this.chainModify([dmgMod[numConsecutive], 4096]);
			},
		},
		name: "Conditioning",
		gen: 8,
		rating: 4.5,
		num: 108,
		shortDesc: "Consecutively using the same move against this Pokemon decreases its damage.",
	},
	content: {
		onStart(source) {
			source.addVolatile('content');
		},
    	condition: {
			onSourceDamagingHit(damage, target, source, move) {
				if (move.category !== 'Status') {
					source.volatiles['content'].madeAttack = true;
				}
			},
   		},
		onResidualOrder: 5,
		onResidualSubOrder: 5,
		onResidual(pokemon) {
      		if (pokemon.volatiles['content'] && !pokemon.volatiles['content'].lostFocus) {
        		this.heal(pokemon.baseMaxhp / 16);
      		}
     		 pokemon.volatiles['content'].madeAttack = false;
    	},
		name: "Content",
		rating: 4,
		num: 337,
		gen: 8,
		shortDesc: "This Pokemon recovers 1/16th of hits health at the end of each turn it uses a Status move.",
	},
	conundrum: {
		onDamagingHit(damage, target, source, move) {
			if (move.flags['contact']) {
				if (this.randomChance(3, 10)) {
					target.addVolatile('confusion', source);
				}
			}
		},
		name: "Conundrum",
		rating: 2,
		num: 2000,
		shortDesc: "30% chance a Pokemon making contact with this Pokemon will be confused.",
	},
	eccentric: {
		// This should be applied directly to the stat as opposed to chaining with the others
		onModifySpAPriority: 5,
		onModifySpA(spa) {
			return this.modify(spa, 1.5);
		},
		onSourceModifyAccuracyPriority: -1,
		onSourceModifyAccuracy(accuracy, target, source, move) {
			if (move.category === 'Special' && typeof accuracy === 'number') {
				return this.chainModify([3277, 4096]);
			}
		},
		flags: {},
		name: "Eccentric",
		rating: 3.5,
		num: 55,
		shortDesc: "This Pokemon's Sp. Atk is 1.5x and accuracy of its physical attacks is 0.8x.",
	},
	feedback: {
		onDamagingHitOrder: 1,
		onDamagingHit(damage, target, source, move) {
			if (!move.flags['contact'] && move.category !== 'Status') {
				this.damage(source.baseMaxhp / 8, source, target);
			}
		},
		name: "Feedback",
		rating: 2.5,
		num: 24,
		//Description in text file
	},
	feisty: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (defender.level > attacker.level) {
				return this.modify(atk, 1.5);
			}
		},
		name: "Feisty",
		rating: 4,
		num: 55,
		shortDesc: "This Pokemon has 1.5x Attack against higher level foes.",
	},
	forage: {
		name: "Forage",
		rating: 0,
		num: 50,
		shortDesc: "No competitive use.",
	},
	iceslick: {
		onModifySpe(spe, pokemon) {
			if (this.field.isWeather('hail') || this.field.isTerrain('snowyterrain')) {
				return this.chainModify(2);
			}
		},
		onImmunity(type, pokemon) {
			if (type === 'hail') return false;
		},
		name: "Ice Slick",
		rating: 3,
		num: 202,
		shortDesc: "If Hail or Snowy Terrain is active, this Pokemon's Speed is doubled. Immunity to Hail damage.",
	},
	orbitaltide: {
		onStart(source) {
			if (!this.field.getPseudoWeather("gravity")) {
				this.add("-activate", source, "ability: Orbital Tide");
				this.field.addPseudoWeather("gravity", source, source.getAbility());
			}
		},
		name: "Gravity Well",
		rating: 3,
		num: 454,
		gen: 8,
		shortDesc: "On switch-in, this Pokemon sets Gravity for 5 turns.",
	},
	overshadow: {
		onStart(pokemon) {
			if (this.suppressingAbility(pokemon)) return;
			this.add('-ability', pokemon, 'Overshadow');
		},
		onAnyModifyAtk(atk, source, target, move) {
			if (source.getHeight() > target.getHeight()) return;
			this.debug('Overshadow Atk drop');
			return this.chainModify(0.50);
		},
		onAnyModifySpA(spa, source, target, move) {
			if (source.getHeight() > target.getHeight()) return;
			this.debug('Overshadow SpA drop');
			return this.chainModify(0.50);
		},
		name: "Overshadow",
		rating: 0,
		num: 1036,
		//Descriptoin in text file
	},
	permafrost: {
		onModifyDefPriority: 5,
		onModifyDef(def, pokemon) {
			if (['hail'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(1.5);
			}
		},
		onImmunity(type, pokemon) {
			if (type === 'hail') return false;
		},
		name: "Permafrost",
		rating: 2,
		num: 94,
		shortDesc: "If Hail is active, this Pokemon's Def is 1.5x; immunity to Hail damage.",
	},
	pollution: {
		onStart(source) {
			this.field.setWeather('acidrain');
		},
		name: "Pollution",
		rating: 4,
		num: 290,
		shortDesc: "On switch-in, this Pokemon summons Acid Rain.",
	},
	psychout: {
		onStart(pokemon) {
			let activated = false;
			for (const target of pokemon.adjacentFoes()) {
				if (!activated) {
					this.add('-ability', pokemon, 'Psych Out', 'boost');
					activated = true;
				}
				if (target.volatiles['substitute']) {
					this.add('-immune', target);
				} else {
					this.boost({spa: -1}, target, pokemon, null, true);
				}
			}
		},
		name: "Psych Out",
		rating: 3.5,
		num: 269,
		shortDesc: "On switch-in, this Pokemon lowers the Sp. Atk of adjacent opponents by 1 stage.",
	},
	reactiveshielding: {
		onDamagingHit(damage, target, source, move) {
			if (move.category === 'Status') return;
			if (move.category === 'Physical') {
				this.boost({def: 1, spd: -1});
			} else if (move.category === 'Special') {
				this.boost({spd: 1, def: -1});
			}
		},
		flags: {},
		name: "Reactive Shielding",
		rating: 3,
		num: 192,
		shortDesc: "This Pokemon's Def/Sp. Def is raised/lowered based on the category of move it's hit with.",
	},
	spectrum: {
		onStart(pokemon) {
			const possibleTargets = pokemon.side.foe.active.filter(foeActive => foeActive && pokemon.isAdjacent(foeActive));
			let rand = 0;
			if (possibleTargets.length > 1) rand = this.random(possibleTargets.length);
			const target = possibleTargets[rand];
			if (target && target.species) {
				const color = target.species.color;
				const colorType: Record<string, string> = {
					red: 'Fire',
					blue: 'Water',
					yellow: 'Electric',
					green: 'Grass',
					black: 'Dark',
					brown: 'Ground',
					purple: 'Poison',
					gray: 'Steel',
					white: 'Flying',
					pink: 'Fairy',
				};
				const type = colorType[this.toID(color)];
				if (type) {
					const newTypes = [type, 'Dragon'];
					this.add('-start', pokemon, 'typechange', newTypes.join('/'), '[from] ability: Spectrum');
					pokemon.setType(newTypes);
				}
			}
		},
		name: "Spectrum",
		rating: 2,
		shortDesc: "This Pokemon's type changes based on the foe's color.",
	},
	scavenger: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === "Move") {
				this.add("-activate", source, "Soul Eater");
				source.heal(source.baseMaxhp / 4);
				this.add("-heal", source, source.getHealth, "[silent]");
			}
		},
		name: "Scavenger",
		rating: 2,
		num: 153,
		shortDesc: "When this Pokemon knocks out a foe it recovers 1/4 of their max HP.",
	},
	siphon: {
		onSourceDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, target, source)) {
				if (this.randomChance(3, 10)) {
					this.heal(source.lastDamage / 2);
				}
			}
		},
		name: "Siphon",
		rating: 2,
		num: 143,
		shortDesc: "This Pokemon has a 30% chance to recover 1/2 the HP lost by the target with contact moves.",
	},
	stubborn: {
		onAfterMoveSecondary(target, source, move) {
			if (!source || source === target || !target.hp || !move.totalDamage) return;
			const lastAttackedBy = target.getLastAttackedBy();
			if (!lastAttackedBy) return;
			const damage = move.multihit ? move.totalDamage : lastAttackedBy.damage;
			if (target.hp <= target.maxhp / 2 && target.hp + damage > target.maxhp / 2) {
				this.boost({def: 1});
			}
		},
		name: "Stubborn",
		rating: 2,
		num: 201,
		shortDesc: "This Pokemon's Defense is raised by 1 when it reaches 1/2 or less of its max HP.",
	},
	sunbathe: {
		onWeather(target, source, effect) {
			if (effect.id === 'sunnyday') {
				this.heal(target.baseMaxhp / 16);
			}
		},
		name: "Sunbathe",
		rating: 1,
		num: 115,
		shortDesc: "If Sunny Day is active, this Pokemon heals 1/16 of its max HP each turn.",
	},
	//comet
	crystallized: {
		onSourceModifyDamage(damage, source, target, move) {
			if (target.getMoveHitData(move).typeMod > 0) {
				this.debug('Crystalized neutralize');
				return this.chainModify(0.75);
			}
		},
		flags: {breakable: 1},
		name: "Crystallized",
		rating: 3,
		num: 111,
		shortDesc: "This Pokemon receives 3/4 damage from supereffective attacks.",
	},
	enchanting: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Fairy' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Enchanting boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Fairy' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Enchanting boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Enchanting",
		rating: 2,
		num: 66,
	},
	extinction: {
		onStart(pokemon) {
			this.add('-start', pokemon, 'typeadd', 'Ghost', '[from] ability: Extinction');
		},
		onTryHit(target, source, move) {
			if (move.category === 'Status' || source.hasAbility('scrappy') || target === source) return;
			if (target.volatiles['miracleeye'] || target.volatiles['foresight']) return;
			if (move.type === 'Normal' || move.type === 'Fighting') {
				this.add('-immune', target);
				return null;
			}
		},
		onAllyTryHitSide(target, source, move) {
			if (move.category === 'Status' || source.hasAbility('scrappy') || target === source) return;
			if (target.volatiles['miracleeye'] || target.volatiles['foresight']) return;
			if (move.type === 'Normal' || move.type === 'Fighting') {
				this.add('-immune', target, '[from] ability: Ethereal Shroud');
			}
		},
		onSourceBasePowerPriority: 18,
		onSourceBasePower(basePower, attacker, defender, move) {
			if (move.type === 'Bug' || move.type === 'Poison') {
				return this.chainModify(0.5);
			}
		},
		name: "Extinction",
		rating: 1,
		num: 194,
		shortDesc: "This Pokemon gains the Ghost-Type defensivley.",
	},
	fortitude: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === 'Move') {
				this.boost({spa: length}, source);
			}
		},
		name: "Fortitude",
		rating: 3,
		num: 289,
		shortDesc: "This Pokemon's Sp. Atk is raised by 1 stage if it attacks and KOes another Pokemon.",
	},
	frigid: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Ice' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Frigid boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Ice' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Frigid boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Frigid",
		rating: 2,
		num: 66,
	},
	moltenize: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status') && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Fire';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		flags: {},
		name: "Moltenize",
		rating: 4,
		num: 206,
		shortDesc: "This Pokemon's Normal-type moves become Fire-type and have 1.2x power.",
	},
	parasite: {
		onAfterMoveSecondarySelf(pokemon, target, move) {
			if (move.flags['contact']) {
				this.heal(pokemon.baseMaxhp / 10);
			}
		},
		name: "Parasite",
		rating: 2,
		num: 173,
		shortDesc: "This Pokemon recovers 1/10 of its health when using a contact move.",
	},
	pounce: {
        onModifyPriority(priority, pokemon, target, move) {
            if (pokemon.activeMoveActions === 0) {
                return priority + 1;
            }
        },
        name: "Pounce",
        rating: 3,
        num: 281,
		shortDesc: "This Pokemon's moves have their priority increased by 1 on its first active turn.",
    },
	spikebarrage: {
		onDamagingHit(damage, target, source, move) {
			const side = source.isAlly(target) ? source.side.foe : source.side;
			const Spikes = side.sideConditions['spikes'];
			const toxicSpikes = side.sideConditions['toxicspikes'];
			if (target.types[0] === 'Poison' && move.flags['contact'] && (!Spikes || Spikes.layers < 3)) {
				this.add('-activate', target, 'ability: Toxic Debris');
				side.addSideCondition('toxicspikes', target);
			} else { (move.flags['contact'] && (!Spikes || Spikes.layers < 3)) 
				this.add('-activate', target, 'ability: Spike Barrage');
				side.addSideCondition('spikes', target);
			}
		}, 
		flags: {},
		name: "Spike Barrage",
		rating: 3.5,
		num: 295,
		shortDesc: "If this Pokemon is hit by a contact move, Spikes are set on the opposing side. Poison types lay Toxic Spikes",
	},
	voltaic: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Electric' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Voltaic boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Electric' && attacker.hp <= attacker.maxhp / 3) {
				this.debug('Voltaic boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Voltaic",
		rating: 2,
		num: 66,
	},
	//armonia
	aerodynamic: {
		onBasePowerPriority: 23,
		onBasePower(basePower, attacker, defender, move) {
			if (move.type === 'Flying') {
				this.debug('Aerodynamic boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Aerodynamic",
		rating: 3.5,
		num: 262,
		shortDesc: "This Pokemon has its Flying-type moves have their power multiplied by 1.5.",
	},
	autoimmune: {
		onSourceModifyAtkPriority: 6,
		onSourceModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Poison') {
				this.debug('Auto Immune weaken');
				return this.chainModify(0.5);
			}
		},
		onSourceModifySpAPriority: 5,
		onSourceModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Ice') {
				this.debug('Auto Immune weaken');
				return this.chainModify(0.5);
			}
		},
		flags: {breakable: 1},
		name: "Auto Immune",
		rating: 3,
		num: 47,
		shortDesc: "Poison-type moves against this Pokemon deal damage with a halved offensive stat.",
	},
	clairvoyance: {
		onBasePowerPriority: 23,
		onBasePower(basePower, attacker, defender, move) {
			if (move.type === 'Psychic') {
				this.debug('Clairvoyance boost');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Clairvoyance",
		rating: 3.5,
		num: 262,
		shortDesc: "This Pokemon has its Psychic-type moves have their power multiplied by 1.5.",
	},
	fullmast: {
		
		onStart(source) {
			const target = source.side.foe.active[source.side.foe.active.length - 1 - source.position];
			source.side.foe.addSideCondition('tailwind');
		},
		name: "Full Mast",
		rating: 3,
		num: 130,
		shortDesc: "Activates the Tailwind effect on entering the battlefield.",
	},
	intellectual: {
		onStart(pokemon) {
			this.boost({spa: 1}, pokemon);
		},
		flags: {},
		name: "Intellectual",
		rating: 4,
		num: 234,
		shortDesc: "On switch-in, this Pokemon's Sp. Atk is raised by 1 stage.",
	},
	piscivorous: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Water') {
				if (!this.boost({atk: 1})) {
					this.add('-immune', target, '[from] ability: Piscivorous');
				}
				return null;
			}
		},
		flags: {breakable: 1},
		name: "Piscivorous",
		rating: 3,
		num: 114,
		shortDesc: "This Pokemon's Attack is raised by 1 stage after it is hit by a Water-type move; Water immunity",
	},
	rockeater: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Rock') {
				if (!this.boost({spa: 1})) {
					this.add('-immune', target, '[from] ability: Rock Eater');
				}
				return null;
			}
		},
		onAnyRedirectTarget(target, source, source2, move) {
			if (move.type !== 'Rock' || move.flags['pledgecombo']) return;
			const redirectTarget = ['randomNormal', 'adjacentFoe'].includes(move.target) ? 'normal' : move.target;
			if (this.validTarget(this.effectState.target, source, redirectTarget)) {
				if (move.smartTarget) move.smartTarget = false;
				if (this.effectState.target !== target) {
					this.add('-activate', this.effectState.target, 'ability: Rock Eater');
				}
				return this.effectState.target;
			}
		},
		flags: {breakable: 1},
		name: "Rock Eater",
		rating: 3,
		num: 31,
		shortDesc: "This Pokemon draws Rock moves to itself to raise Sp. Atk by 1; Rock immunity.",
	},
	//vanguard
	parasomnia: {
		onResidualOrder: 28,
		onResidualSubOrder: 2,
		onResidual(pokemon) {
			if (!pokemon.hp) return;
			for (const target of pokemon.foes()) {
				if (target.status === 'slp' || target.hasAbility('comatose')) {
					this.damage(target.baseMaxhp / 16, target, pokemon);
				}
			}
		},
		onModifyMove(move) {
			if (move.id === 'hypnosis' || move.id === 'sing' || move.id === 'darkvoid' || move.id === 'lovelykiss') {
				move.accuracy = true;
			}
		},
		flags: {},
		name: "Parasomnia",
		rating: 3,
		num: 123,
		shortDesc: "Sleeping foes to lose 1/16 of their max HP at the end of each turn. Sleep inducing moves can't miss.",
	},
	rebinding: { //test
		onDamagePriority: -30,
		onDamage(damage, target, source, effect) {
			if (target.abilityState.rebindingTriggered) return;
			if (damage >= target.hp && effect && effect.effectType === 'Move') {
				this.add('-ability', target, 'Sturdy');
				target.abilityState.rebindingTriggered = true;
				return target.hp - 1;
			}
		},
		onAfterMoveSecondary(target, source, move) {
			if (!source || source === target || !target.hp || !move.totalDamage || !this.canSwitch(target.side) ||
				target.forceSwitchFlag || target.switchFlag || target.abilityState.rebindingTriggered) return;
			for (const side of this.sides) {
				for (const active of side.active) {
					active.switchFlag = false;
				}
			}
			const lastAttackedBy = target.getLastAttackedBy();
			if (!lastAttackedBy) return;
			const damage = move.multihit ? move.totalDamage : lastAttackedBy.damage;
			if (target.hp = 1) {
				target.abilityState.rebindingTriggered = true;
				target.switchFlag = true;
				this.add('-activate', target, 'ability: Rebinding');
				target.heal(target.baseMaxhp);
			}
		},
		name: "Rebinding",
		rating: 5,
		num: 201,
		shortDesc: "If this Pokemon would be KOed, it survives with 1 HP then switches out and heals 100%. Single Use.",
	},
	ancientknowledge: {
		onModifySpAPriority: 5,
		onModifySpA(SpA) {
			return this.chainModify(2);
		},
		name: "Ancient Knowledge",
		rating: 5,
		num: 37,
		shortDesc: "This Pokemon's Special Attack is doubled.",
	},
	criticalbeat: {
		onModifyAtkPriority: 5,
		onModifyAtk(spa, pokemon) {
			if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(1.5);
			}
		},
		onWeather(target, source, effect) {
			if (target.hasItem('utilityumbrella')) return;
			if (effect.id === 'sunnyday' || effect.id === 'desolateland') {
				this.damage(target.baseMaxhp / 8, target, target);
			}
		},
		flags: {},
		name: "Critical Beat",
		rating: 2,
		num: 94,
		shortDesc: "If Sunny Day is active, this Pokemon's Atk is 1.5x; loses 1/8 max HP per turn.",
	},
	malevolence: {
		onModifyPriority(priority, pokemon, target, move) {
			if (move?.type === 'Dark' && pokemon.hp === pokemon.maxhp) return priority + 1;
		},
		flags: {},
		name: "Malevolence",
		rating: 1.5,
		num: 177,
		shortDesc: "If this Pokemon is at full HP, its Dark-type moves have their priority increased by 1.",
	},
	blazeimpact: {
		onSourceDamagingHit(damage, target, source, move) {
			// Despite not being a secondary, Shield Dust / Covert Cloak block Poison Touch's effect
			if (target.hasAbility('shielddust') || target.hasItem('covertcloak')) return;
			if (this.checkMoveMakesContact(move, target, source)) {
				if (this.randomChance(3, 10)) {
					target.trySetStatus('brn', source);
				}
			}
		},
		flags: {},
		name: "Blaze Impact",
		rating: 2,
		num: 143,
		shortDesc: "This Pokemon's contact moves have a 30% chance of burning.",
	},
	darkenedscales: {
		onSourceModifyDamage(damage, source, target, move) {
			if (move.category === 'Physical') {
				return this.chainModify(0.5);
			}
		},
		flags: {breakable: 1},
		name: "Darkened Scales",
		rating: 4,
		num: 246,
		shortDesc: "This Pokemon receives 1/2 damage from physical attacks.",
	},
	sandshroud: {
		onWeather(target, source, effect) {
			if (target.hasItem('utilityumbrella')) return;
			if (effect.id === 'sandstorm') {
				this.heal(target.baseMaxhp / 16);
			}
		},
		flags: {},
		name: "Sand Shroud",
		rating: 1.5,
		num: 44,
		shortDesc: "If Sandstorm is active, this Pokemon heals 1/16 of its max HP each turn.",
	},
	soulconductor: {
		onBasePowerPriority: 23,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['punch']) {
				this.debug('Soul Conductor boost');
				return this.chainModify([4915, 4096]);
			}
		},
		flags: {},
		name: "Soul Conductor",
		rating: 3,
		num: 89,
		shortDesc: "This Pokemon's soul-based attacks have 1.2x power.",
	},
	artificer: {
		onSourceDamagingHit(damage, target, source, move) {
			if (move.recoil || move.hasCrashDamage) {
				this.debug('Artificer boost');
				this.boost({spe: 1}, source);
			}
		},
		flags: {},
		name: "Artificer",
		rating: 3,
		num: 120,
		shortDesc: "Recoil moves increase user's speed by 1 stage.",
	},
	ancestry: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status') && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Dragon';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		flags: {},
		name: "Ancestry",
		rating: 4,
		num: 206,
		shortDesc: "This Pokemon's Normal-type moves become Dragon type and have 1.2x power.",
	},
	apexneigh: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === 'Move') {
				this.boost({def: length, spd: length}, source);
			}
		},
		flags: {},
		name: "Apex Neigh",
		rating: 3,
		num: 264,
		shortDesc: "This Pokemon's Def and Sp. Def is raised by 1 stage if it attacks and KOes another Pokemon.",
	},
	boilingaura: {
		onSourceModifyAtkPriority: 6,
		onSourceModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Water') {
				this.debug('Boiling Aura weaken');
				return this.chainModify(0.5);
			}
		},
		onSourceModifySpAPriority: 5,
		onSourceModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Water') {
				this.debug('Boiling Aura weaken');
				return this.chainModify(0.5);
			}
		},
		flags: {breakable: 1},
		name: "Boiling Aura",
		rating: 3.5,
		num: 47,
		shortDesc: "Water-type moves against this Pokemon deal damage with a halved offensive stat.",
	},
	everspread: {
		onModifyPriority(priority, pokemon, target, move) {
			if (move?.category === 'Status') {
				return priority - 7;
			}
		},
		onAfterMove(source, target, move) {
			if (move.category !== 'Status') { return; }
			if (!move.succeeded) return;

			this.actions.runAdditionalMove(
				Dex.moves.get("smite"),
				source,
				target,
			);
		},
		flags: {},
		name: "Everspread",
		rating: 4,
		num: 158,
		shortDesc: "This Pokemon's Status moves always go last, but set a layer of Toxic Spikes.",
	},
	spikyshedding: {
		onDamagingHit(damage, target, source, move) {
			const side = source.isAlly(target) ? source.side.foe : source.side;
			const Spikes = side.sideConditions['spikes'];
			if (move.flags['contact'] && (!Spikes || Spikes.layers < 3)) {
				this.add('-activate', target, 'ability: Spiky Shedding');
				side.addSideCondition('spikes', target);
			}
		},
		flags: {},
		name: "Spiky Shedding",
		rating: 3.5,
		num: 295,
		shortDesc: "If this Pokemon is hit by a contact move, Spikes are set on the opposing side.",
	},
	songstress: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Sound') {
				move.accuracy = true;
				if (!target.addVolatile('songstress')) {
					this.add('-immune', target, '[from] ability: Songstress');
				}
				return null;
			}
		},
		onEnd(pokemon) {
			pokemon.removeVolatile('songstress');
		},
		condition: {
			noCopy: true, // doesn't get copied by Baton Pass
			onStart(target) {
				this.add('-start', target, 'ability: Flash Fire');
			},
			onModifyAtkPriority: 5,
			onModifyAtk(atk, attacker, defender, move) {
				if (move.type === 'Sound' && attacker.hasAbility('songstress')) {
					this.debug('Songstress boost');
					return this.chainModify(1.5);
				}
			},
			onModifySpAPriority: 5,
			onModifySpA(atk, attacker, defender, move) {
				if (move.type === 'Sound' && attacker.hasAbility('songstress')) {
					this.debug('Soundstress boost');
					return this.chainModify(1.5);
				}
			},
			onEnd(target) {
				this.add('-end', target, 'ability: Flash Fire', '[silent]');
			},
		},
		flags: {breakable: 1},
		name: "Songstress",
		rating: 3.5,
		num: 18,
		shortDesc: "This Pokemon's Sound attacks do 1.5x damage if hit by one Sound move; Sound immunity.",
	},
	creamation: {
		onAnyFaintPriority: 1,
		onAnyFaint() {
			this.boost({spd: 1}, this.effectState.target);
		},
		flags: {},
		name: "Creamation",
		rating: 3.5,
		num: 220,
		shortDesc: "This Pokemon's Sp. Def is raised by 1 stage when another Pokemon faints.",
	},
	tidalneigh: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === 'Move') {
				this.boost({def: length}, source);
			}
		},
		flags: {},
		name: "Warping Neigh",
		rating: 3,
		num: 264,
		shortDesc: "This Pokemon's Def is raised by 1 stage if it attacks and KOes another Pokemon.",
	},
	vacuumcore: {
		onDamagingHitOrder: 1,
		onDamagingHit(damage, target, source, move) {
			if (move.flags['wind'] || move.type === 'Electric') {
				this.boost({spa: 1});
			}
		},
		onAnyRedirectTarget(target, source, source2, move) {
			if (move.type !== 'Electric' || move.flags['pledgecombo']) return;
			const redirectTarget = ['randomNormal', 'adjacentFoe'].includes(move.target) ? 'normal' : move.target;
			if (this.validTarget(this.effectState.target, source, redirectTarget)) {
				if (move.smartTarget) move.smartTarget = false;
				if (this.effectState.target !== target) {
					this.add('-activate', this.effectState.target, 'ability: Vaccum Core');
				}
				return this.effectState.target;
			}
		},
		flags: {},
		name: "Vacuum Core",
		rating: 1,
		num: 277,
		shortDesc: "This Pokemon draws Electric and wind moves to itself to raise Sp. Atk by 1.",
	},
	warpingneigh: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === 'Move') {
				this.boost({spd: length}, source);
			}
		},
		flags: {},
		name: "Warping Neigh",
		rating: 3,
		num: 264,
		shortDesc: "This Pokemon's Sp. Def is raised by 1 stage if it attacks and KOes another Pokemon.",
	},
	duality: {
    	onBasePowerPriority: 23,
    	onBasePower(basePower, attacker, defender, move) {
     		if (move.multihit = 2) {
        		this.debug('Duality boost');
      			return this.chainModify(2);
     		 }
    	},
   		name: "Duality",
   		rating: 3,
    	num: 1013,
		shortDesc: "This Pokemon's moves that hit twice have their base power doubled.",
  	},
	hypervanity: {
		onStart(pokemon) {
			if (pokemon.gender === 'N') return;
			if (pokemon.gender === 'M') {
				this.boost({atk: 1, def: -1}, pokemon);
			} else {
				this.boost({spa: 1, spd: -1}, pokemon);
			}
		},
		flags: {},
		name: "Hypervanity",
		rating: 3.5,
		num: 235,
		shortDesc: "On switch-in, Male Pokemon recieve +1 Atk -1 Def and Females recieve +1 Sp. Atk -1 Sp. Def.",

	},
	mirrorspell: { //Test
		onDamagingHit(damage, target, source, move) {
			if (move.category === 'Special' && !target.activeTurns)
				 { return; }
				const counterMove = this.dex.getActiveMove(move.id);
				this.add("-activate", target, "Mirror Spell");
				this.actions.runMove(counterMove, target, target.getLocOf(source));
		},
		flags: {breakable: 1},
		name: "Mirror Spell",
		rating: 3,
		num: 400,
		gen: 9,
		shortDesc: "On switch-in, if this Pokemon is hit by special attack, the attack is reflected.",
	},
	snowball: {
    	onBasePowerPriority: 23,
    	onBasePower(basePower, attacker, defender, move) {
     		if (move.flags['locked']) {
        		this.debug('Snowball boost');
      			return this.chainModify(1.3);
     		 }
    	},
		onAfterMoveSecondarySelf(pokemon, target, move) {
			if (move.flags['locked']) {
				this.boost({def: 1, spd: 1,}, pokemon);
			}
		},
   		name: "Snowball",
   		rating: 3,
    	num: 1013,
		shortDesc: "This Pokemon's Locking attacks have 1.3x power and increase Def and Sp. Def by 1 stage.",
  	},
	  apttoserver: {
		onAnyPseudoWeatherChange(pokemon) {
			if (this.field.getPseudoWeather('trickroom')) {
				this.boost({spe: -1}, pokemon);
			}
		},
		flags: {},
		name: "Apt To Serve",
		rating: 3,
		num: 34,
		shortDesc: "If Trick Room is active, this Pokemon's Speed is lowered 1 stage.",

	},
	windmaestro: {//need to add wind moves forced to hit ally for doubles
		onStart(pokemon) {
			if (pokemon.side.sideConditions['tailwind']) {
				this.boost({atk: 1}, pokemon, pokemon);
			}
		},
		onTryHit(target, source, move) {
			if (target !== source && move.flags['wind']) {
				if (!this.boost({atk: 1}, target, target)) {
				}
			}
		},
		onAllySideConditionStart(target, source, sideCondition) {
			const pokemon = this.effectState.target;
			if (sideCondition.id === 'tailwind') {
				this.boost({atk: 1}, pokemon, pokemon);
			}
		},
		flags: {breakable: 1},
		name: "Wind Maestro",
		rating: 2,
		num: 274,
		shortDesc: "Attack raised by 1 if hit by a wind move or Tailwind begins. Wind moves redirected to hit ally Pokemon.",
	},
	//Elite Redux
	aerodynamics: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === "Flying") {
				if (!this.boost({spe: 1})) {
					this.add("-immune", target, "[from] ability: Aerodynamics");
				}
				return null;
			}
		},
		flags: {breakable: 1},
		name: "Aerodynamics",
		rating: 3,
		num: 312,
		gen: 8,
		shortDesc: "Boosts Speed instead of being hit by Flying-type moves.",

	},
	airblower: {
		onStart(source) {
			// duration handled in data/moves.js:tailind
			const tailwind = source.side.sideConditions["tailwind"];
			if (!tailwind) {
				this.add("-activate", source, "ability: Air Blower");
				source.side.addSideCondition(
					"tailwind",
					source,
					source.getAbility()
				);
			}
		},
		name: "Air Blower",
		rating: 5,
		num: 349,
		gen: 8,
		shortDesc: "The user casts a 3-turn Tailwind on entry.",
	},
	arcticfur: {
		onSourceModifyDamage(atk, attacker, defender, move) {
			return this.chainModify(0.65);
		},
		flags: {breakable: 1},
		name: "Arctic Fur",
		rating: 3,
		num: 399,
		gen: 8,
		shortDesc: "This Pokemon takes 35% less damage from attacks",
	},
	atlas: {
		onStart(source) {
			if (!this.field.getPseudoWeather("gravity")) {
				this.add("-activate", source, "ability: Atlas");
				this.field.addPseudoWeather("gravity", source, source.getAbility());
			}
		},
		onFractionalPriority: -0.1,
		name: "Atlas",
		rating: 3,
		num: 447,
		gen: 8,
		shortDesc: "On switch-in, this Pokemon sets Gravity. User moves last.",
	},
	atomicburst: {
		onDamagingHit(damage, pokemon, attacker, attackerMove) {
			if (attacker.hp <= 0) { return; }
			if (pokemon.getMoveHitData(attackerMove).typeMod <= 0) return;

			const move = Dex.moves.get("hyperbeam");
			const flags = move.flags;
			delete flags.recharge;

			this.actions.runAdditionalMove(
				move,
				pokemon,
				attacker,
				{basePower: 50, self: {}, flags: flags}
			);
		},
		name: "Atomic Burst",
		rating: 3.5,
		num: 420,
		gen: 8,
		shortDesc: "This Pokemon attacks with a 50bp Hyper Beam when hit by a super effective move. Does not cause recharge.",
	},
	avenger: {
		onModifyDamage(atk, attacker, defender, move) {
			if (attacker.side.faintedLastTurn) {
				this.debug("Avenger boost");
				return this.chainModify(1.5);
			}
		},
		name: "Avenger",
		rating: 3,
		num: 322,
		gen: 8,
		shortDesc: "If a party Pokémon fainted last turn, next move gets 1.5x boost.",
	},
	badluck: {
		onFoeModifyMove(move, pokemon) {
			move.willCrit = false;

			// apparently bad luck lowers accuracy of moevs with no accuracy. fun stuff.
			if (typeof move.accuracy === "number") move.accuracy -= 5;
			if (move.accuracy === true) move.accuracy = 95;
		},
		// Low damage roll implementation is in battle-actions.ts, NEED TO ADD
		name: "Bad Luck",
		rating: 2,
		num: 362,
		gen: 8,
		shortDesc:"Foes always deal lowest damage roll, have all accuracy lowered by 5% and cannot land Critical hits",
	},
	banshee: {
		onModifyType(move, pokemon) {
			if (move.flags["sound"] && move.type === "Normal" && !pokemon.volatiles["dynamax"]) {
				// hardcode
				move.type = "Ghost";
				move.typeChangerBoosted = this.effect;
			}
		},
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.flags["sound"] && move.typeChangerBoosted) {
				return this.chainModify(1.2);
			}
		},
		name: "Banshee",
		gen: 8,
		shortDesc: "Normal-type sound moves become Ghost-type moves and get a 1.2x boost.",
	},
	blitzboxer: {
		onModifyPriority(priority, pokemon, target, move) {
			if (move.flags["punch"] && pokemon.hp === pokemon.maxhp) { return priority + 1; }
		},
		name: "Blitz Boxer",
		rating: 4,
		num: 309,
		gen: 8,
		shortDesc:"At full HP, gives +1 priority to this Pokémon's punching moves.",
	},
	bloodprice: {
		onModifyDamage(damage, source, target, move) {
			return this.chainModify(1.3);
		},
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target)) {
				this.damage(source.baseMaxhp / 10, source, source);
			}
		},
		name: "Blood Price",
		rating: 4,
		num: 309,
		gen: 8,
		shortDesc: "The user deals 30% more damage but loses 10% HP when attacking.",
	},
	bloodstain: {
		onStart(pokemon) {
			if (!pokemon.status) {
				return pokemon.setStatus('bld', pokemon);
			}	
		},
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target, true)) {
				source.trySetStatus("bld", target);
			}
		},
		name: "Blood Stain",
		rating: 2,
		num: 49,
		shortDesc:"Pokemon making contact with this Pokemon will bleed. Bleeds on entry.",
	},
	bloodstigma: {
		onModifyDamage(damage, source, target, move) {
			if (target.status === 'bld') {
				this.debug("Blood Stigma boost");
				return this.chainModify(1.5);
			}
		},
		onSetStatus(status, target, source, effect) {
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Blood Stigma');
			}
			return false;
		},
		flags: {},
		name: "Blood Stigma",
		rating: 2,
		num: 138,
		shortDesc:"This Pokemon does deals 1.5x damage to bleeding foes. Immune to being statused.",
	},
	bonezone: {
		onModifyMove(move, target) {
			if (move.flags["bone"]) {
				move.ignoreImmunity = true;
			}
		},
		onModifyDamage(damage, source, target, move) {
			if (move.flags["bone"] && target.getMoveHitData(move).typeMod < 0) {
				this.debug("Bone Zone boost");
				return this.chainModify(2);
			}
		},
		name: "Bone Zone",
		rating: 4,
		num: 368,
		gen: 8,
		shortDesc:"Bone moves ignore immunities and deal 2x damage if not very effective ",
	},
	bruteforce: {
		onBasePowerPriority: 23,
		onBasePower(basePower, attacker, defender, move) {
			if (move.recoil || move.hasCrashDamage) {
				this.debug('Bruteforce boost');
				return this.chainModify([4915, 4096]);
			}
		},
		onDamage(damage, target, source, effect) {
			if (effect.id === 'recoil') {
				if (!this.activeMove) throw new Error("Battle.activeMove is null");
				if (this.activeMove.id !== 'struggle') return null;
			}
		},
		flags: {},
		name: "Bruteforce",
		rating: 3,
		num: 120,
		shortDesc: "This Pokemon does not take recoil damage and recoil moves have 1.2x power.",

	},
	celestialblessing: {
		onResidualOrder: 5,
		onResidualSubOrder: 1,
		onResidual(pokemon) {
			if (this.field.isTerrain("mistyterrain")) {
				this.heal(pokemon.baseMaxhp / 12);
			}
		},
		name: "Celestial Blessing",
		shortDesc: "This Pokemon recovers 1/12 of its health each turn under Misty Terrain.",
	},
	championsentrance: {
		onStart(pokemon) {
			pokemon.addVolatile("championsentrance");
			let activated = false;
			for (const target of pokemon.adjacentFoes()) {
				if (!activated) {
					this.add('-ability', pokemon, 'Champion\u2019s Entrance', 'boost');
					activated = true;
				}
				if (target.volatiles['substitute']) {
					this.add('-immune', target);
				} else {
					this.boost({atk: -1}, target, pokemon, null, true);
				}
			}
		},
		condition: {
			duration: 1,
			onModifyAtk(atk, source, target, move) {
				return this.chainModify(1.2);
			},
			onModifySpe(spe, source) {
				return this.chainModify(1.5);
			},
		},
		name: "Champion\u2019s Entrance",
		rating: 3.5,
		num: 365,
		gen: 8,
		shortDesc: "On switch-in, lowers the Attack of opponents by 1 stage; boosts user's Spe by 50% and Atk by 20% on first turn.",
	},
	/*cheatingdeath: {
		onStart(pokemon) {
			if (pokemon.activeTurns === 0 && !this.effectState.beginCD) {
				this.effectState.beginCD = true;
				this.effectState.hitsLeft = 2;
			}
		},
		onDamage(damage, mon, source, effect) {
			if (mon === source) return;
			if (damage <= 0) return;
			if (effect.effectType !== "Move") return;
			mon.permanentAbilityState["cheatingdeath"] = mon.permanentAbilityState["cheatingdeath"] || 0;
			if (mon.permanentAbilityState["cheatingdeath"] >= 2) return;
			mon.permanentAbilityState["cheatingdeath"]++;
			this.add("-activate", mon, "ability: Cheating Death");
			return 0;
		},
		name: "Cheating Death",
		rating: 3,
		num: 440,
		gen: 8,
		shortDesc: "This Pokemon takes no damage from the first two hits",
	},*/
	chloroplast: {
		name: "Chloroplast",
		// implemented in the corresponding move(s) WILL NEED TO IMPLEMENT ON LAUNCH
		rating: 3,
		num: 298,
		gen: 8,
		shortDesc: "This Pokemon uses moves as if under Sunny Day. CODE THIS ON LAUNCH",
	},
	christmasspirit: {
		onSourceModifyDamage(spa, pokemon) {
			if (["hail", "snow"].includes(pokemon.effectiveWeather())) {
				return this.chainModify(2);
			}
		},
		flags: {breakable: 1},
		name: "Christmas Spirit",
		rating: 4,
		num: 314,
		gen: 8,
		shortDesc: "This Pokemon takes half damage during Hail/Snow.",
	},
	chunkybassline: {
		onAfterMove(source, target, move) {
			if (!move?.flags["sound"]) return;
			if (!move.succeeded) return;
			const moveMutations = {
				basePower: 40,
			};
			this.actions.runAdditionalMove(
				Dex.moves.get("earthquake"),
				source,
				target,
				moveMutations
			);
		},
		name: "Chunky Bass Line",
		rating: 3,
		num: 404,
		gen: 8,
		shortDesc: "This Pokemon attacks with a 40bp Earthquake after using Sound-based move.",
	},
	clueless: {
		onStart(pokemon) {
			this.add("-ability", pokemon, "Clueless");
			this.eachEvent("WeatherChange", this.effect);
		},
		onEnd(pokemon) {
			this.eachEvent("WeatherChange", this.effect);
		},

		// Room suppressions implemented in getActionSpeed(), getDefenseStat(), ignoringItem(),
		suppressRoom: true,
		suppressTerrain: true,
		suppressWeather: true,
		flags: {failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1},
		name: "Clueless",
		rating: 3,
		num: 435,
		gen: 8,
	},
	coldrebound: {
		onDamagingHit(damage, target, source, move) {
			if (
				!(target.hp > 0) ||
				!move.flags["contact"]
			) { return; }
			const counterMove = Dex.moves.get("icywind");
			this.add("-activate", target, "Cold Rebound");
			this.effectState.counter = true;
			this.actions.runAdditionalMove(counterMove, target, source);
		},
		onModifyMove(move) {
			if (this.effectState.counter) {
				this.effectState.counter = false;
			}
		},
		flags: {breakable: 1},
		name: "Cold Rebound",
		rating: 3,
		num: 400,
		gen: 8,
		shortDesc:"Attacks with Icy Wind when hit by a contact move.",
	},
	combatspecialist: {
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.flags["punch"]) {
				this.debug("Iron Fist boost");
				return this.chainModify(1.3);
			}
			if (move.flags["kick"]) {
				this.debug("Striker boost");
				return this.chainModify(1.3);
			}
		},
		name: "Combat Specialist",
		gen: 8,
		shortDesc: "Boost the power of punching and kicking moves by 1.3x.",
	},
	contempt: {
		onAnyModifyBoost(boosts, pokemon) {
			const unawareUser = this.effectState.target;
			if (unawareUser === pokemon) return;
			if (
				unawareUser === this.activePokemon &&
				pokemon === this.activeTarget
			) {
				boosts["def"] = 0;
				boosts["spd"] = 0;
				boosts["evasion"] = 0;
			}
			if (
				pokemon === this.activePokemon &&
				unawareUser === this.activeTarget
			) {
				boosts["atk"] = 0;
				boosts["def"] = 0;
				boosts["spa"] = 0;
				boosts["accuracy"] = 0;
			}
		},
		onAfterEachBoost(boost, target, source, effect) {
			if (!source || target.isAlly(source)) {
				if (effect.id === "stickyweb") {
					this.hint(
						"Court Change Sticky Web counts as lowering your own Speed, and Contempt only affects stats lowered by foes.",
						true,
						source.side
					);
				}
				return;
			}
			let statsLowered = false;
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! < 0) {
					statsLowered = true;
				}
			}
			if (statsLowered) {
				this.boost({atk: 1}, target, target, null, false, true);
			}
		},
		flags: { breakable: 1 },
		name: "Contempt",
		shortDesc: "Ignores opposing stat change and boosts Attack when stat lowered.",
	},
	cosmicdaze: {
		onFoeModifyDamage(damage, source, target, move) {
			if (move.name === "confused") {
				return this.chainModify(2);
			}
		},
		onModifyDamage(damage, source, target, move) {
			if (target.status === "confusion") {
				return this.chainModify(2);
			}
		},
		name: "Cosmic Daze",
		rating: 2,
		num: 400,
		gen: 9,
		shortDesc: "User deals double damage to confused foe(s). Foe(s) take double confusion damage.",
	},
	deadpower: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk) {
			return this.chainModify(1.5);
		},
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target)) {
				if (this.randomChance(2, 10)) {
					source.trySetStatus("curse", target);
				}
			}
		},
		name: "Dead Power",
		shortDesc: "User has 1.5x Attack. 20% chance to curse foe with contact moves.",
	},
	deceitconjourer: {
		onDamage(damage, target, source, effect) {
			if (effect.effectType !== 'Move') {
				if (effect.effectType === 'Ability') this.add('-activate', source, 'ability: ' + effect.name);
				return false;
			}
		},
		onTryHitPriority: 1,
		onTryHit(target, source, move) {
			if (target === source || move.hasBounced || !move.flags['reflectable'] || target.isSemiInvulnerable()) {
				return;
			}
			const newMove = this.dex.getActiveMove(move.id);
			newMove.hasBounced = true;
			newMove.pranksterBoosted = false;
			this.actions.useMove(newMove, target, { target: source });
			return null;
		},
		onAllyTryHitSide(target, source, move) {
			if (target.isAlly(source) || move.hasBounced || !move.flags['reflectable'] || target.isSemiInvulnerable()) {
				return;
			}
			const newMove = this.dex.getActiveMove(move.id);
			newMove.hasBounced = true;
			newMove.pranksterBoosted = false;
			this.actions.useMove(newMove, this.effectState.target, { target: source });
			return null;
		},
		condition: {
			duration: 1,
		},
		flags: { breakable: 1 },
		name: "Magic Guard",
		rating: 4,
		num: 98,
		shortDesc: "This Pokemon can only be damaged by direct attacks, bounces back certain non damaging moves.",

	},
	demolitionist: {
		onStart(pkmn) {
			pkmn.addVolatile("readiedaction");
		},
		onTryHit(target, source) {
			if (!source.getVolatile("readiedaction")) return;
			target.side.removeSideCondition('reflect');
			target.side.removeSideCondition('lightscreen');
			target.side.removeSideCondition('auroraveil');
		},
		onModifyMove(move, source) {
			if (!source.getVolatile("readiedaction")) return;
			if (move.flags["protect"]) delete move.flags["protect"];
		},
		name: "Demolitionist",
		shortDesc: "Doubles attack, ignores protect, and breaks screens on first attack.",
	},
	depravity: {
		onModifyMove(move) {
			const baseEffectiveness = move.onEffectiveness;
			move.onEffectiveness = (effectiveness, target, type, usedMove) => {
				if (usedMove.type === 'Electric' && type === 'Electric') return 1;
				return baseEffectiveness?.apply(this, [effectiveness, target, type, usedMove]);
			};
		},
		onModifyCritRatio(critRatio, source, target) {
			if (target && ['psn', 'tox'].includes(target.status)) return 5;
		},
		// Electric type paralysis implemented in sim/pokemon.js:setStatus
		name: "Depravity",
		rating: 3,
		num: 364,
		gen: 8,
		shortDesc: "Electric type moves are super effective vs Electric and can paralyze; garunteed crit against poisoned foe(s).",

	},
	desertcloak: {
		onAllySetStatus(status, target, source, effect) {
			if (["sandstorm"].includes(target.effectiveWeather())) {
				if ((effect as Move)?.status) {
					this.add("-immune", target, "[from] ability: Desert Cloak");
				}
				return false;
			}
		},
		onAllyTryAddVolatile(status, target) {
			if (
				status.id === "yawn" &&
				["sandstorm"].includes(target.effectiveWeather())
			) {
				this.add("-immune", target, "[from] ability: Desert Cloak");
				return null;
			}
		},
		name: "Desert Cloak",
		rating: 3,
		num: 427,
		gen: 9,
		shortDesc: "If sandstorm is active, this Pokemon and its allies are protected from status and secondary effects of attacks",
	},
	draconize: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				"judgment",
				"multiattack",
				"naturalgift",
				"revelationdance",
				"technoblast",
				"terrainpulse",
				"weatherball",
			];
			if (
				move.type === "Normal" &&
				!noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== "Status") &&
				!(move.name === "Tera Blast" && pokemon.terastallized)
			) {
				move.type = "Dragon";
				move.typeChangerBoosted = this.effect;
			}
		},
		onModifyDamage(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) { return this.chainModify(1.2); }
		},
		name: "Draconize",
		rating: 4,
		num: 422,
		gen: 8,
		shortDesc: "This Pokemon's Normal-type moves become Dragon type and have 1.2x power.",
	}, 
	dualwield: {
		// Uses parentalBond as base.
		onPrepareHit(source, target, move) {
			if (isParentalBondBanned(move, source)) { return; }
			if (move.flags["pulse"] || move.flags['slicing']) {
				move.multihit = 2;
				move.multihitType = "parentalbond";
			}
		},
		onSourceModifySecondaries(secondaries, target, source, move) {
			console.log(move.hit, move.secondaries);
			if (move.multihitType !== "parentalbond") return;
			if (!secondaries) return;
			if (move.hit <= 1) return;
			secondaries = secondaries.filter((effect) => effect.volatileStatus !== "flinch" || effect.ability || effect.kingsrock);
			return secondaries;
		},
		name: "Dual Wield",
		rating: 3,
		num: 449,
		gen: 8,
		shortDesc: "Mega Launcher and Keen Edge moves hit twice for 75% damage.",
	},
	duneterror: {
		onSourceModifyDamage(damage, source, target, move) {
			if (target.effectiveWeather() === "sandstorm") {
				this.chainModify(0.65);
			}
		},
		onModifyDamage(atk, attacker, defender, move) {
			if (move.type === "Ground") {
				this.debug("Dune Terror boost");
				return this.chainModify(1.2);
			}
		},
		flags: {breakable: 1},
		name: "Dune Terror",
		rating: 3,
		num: 444,
		gen: 8,
		shortDesc: "This Pokemon's Ground type attacks are boosted by 20%. Takes 35% less damage under Sandstorm.",
	},
	elementalcharge: {
		onModifyMove(move) {
			let status;
			switch (move.type) {
				case 'Electric':
					status = 'par'
					break;
				case 'Fire':
					status = 'brn';
					break;
				case 'Ice':
					status = 'frz'
					break;
				default:
			}
			if (status) {
				if (!move.secondaries) {
					move.secondaries = [];
				}
				move.secondaries.push({
					chance: 20,
					status: status,
					ability: this.dex.abilities.get('elementalcharge'),
				});
			}

		},
		name: "Elemental Charge",
		rating: 3,
		num: 448,
		gen: 9,
		shortDesc: "This Pokemon's moves have a 20% chance to BRN/FRZ/PARA depending on move type."
	}, 
	equinox: {
		onModifyMove(move, attacker, defender) {
			if (!defender) return;

			const spa = attacker.calculateStat("spa", attacker.boosts["spa"], 1, attacker, defender, move, 0);
			const atk = attacker.calculateStat("atk", attacker.boosts["atk"], 1, attacker, defender, move, 0);
			if (spa > atk) move.overrideOffensiveStat = "spa";
			else if (atk > spa) move.overrideOffensiveStat = "atk";
		},
		name: "Equinox",
		rating: 3,
		num: 438,
		gen: 8,
		shortDesc: "This Pokemon's lower attacking stat is raised to its higher attacking stat.",
	},
	eternalblessing: {
		onResidualOrder: 5,
		onResidualSubOrder: 1,
		onResidual(pokemon) {
			if (this.field.isTerrain("mistyterrain")) {
				this.heal(pokemon.baseMaxhp / 12);
			}
		},
		onSwitchOut(pokemon) {
			pokemon.heal(pokemon.baseMaxhp / 3);
		},
		name: "Eternal Blessing",
		shortDesc: "Restores 1/3 max HP on switch-out adn 1/12 of its HP each turn under Misty Terrain.",
	},
	evaporate: {
		onTryHit(target, source, move) {
			if (!move.type.toLowerCase().includes("water")) return;
			this.add("-immune", target, "[from] ability: Evaporate");
			this.add("-activate", target, "move: Mist");
			target.side.addSideCondition("mist");
			return null;
		},
		flags: {breakable: 1},
		name: "Evaporate",
		shortDesc: "This Pokemon sets Mist if hit by a Water move. Water immunity.",
	},
	exploitweakness: {
		onModifyDamage(basePower, attacker, defender, move) {
			if (defender.status) {
				return this.chainModify(1.25);
			}
		},
		name: "Exploit Weakness",
		rating: 2,
		num: 315,
		gen: 9,
		shortDesc: "This Pokemon's move power is 1.25x if the target is statused.",
	},
	fearmonger: {
		onStart(pokemon) {
			let activated = false;
			for (const target of pokemon.adjacentFoes()) {
				if (!activated) {
					this.add("-ability", pokemon, "Fearmonger", "boost");
					activated = true;
				}
				if (target.volatiles["substitute"]) {
					this.add("-immune", target);
				} else {
					this.boost({spa: -1, atk: -1}, target, pokemon, null, true);
				}
			}
		},
		onModifyMove(move) {
			if (!move?.flags["contact"] || move.target === "self") return;
			if (!move.secondaries) {
				move.secondaries = [];
			}
			move.secondaries.push({
				chance: 10,
				status: "par",
				ability: this.dex.abilities.get("fearmonger"),
			});
		},
		name: "Fearmonger",
		rating: 4,
		num: 423,
		gen: 8,
		shortDesc: "Lowers foe's Atk and Sp.Atk by 1 stage on switch-in; contact moves have 10% chance to paralyze",
	},
	fertilize: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status') && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Grass';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) return this.chainModify([4915, 4096]);
		},
		flags: {},
		name: "Fertilize",
		rating: 4,
		num: 206,
		shortDesc: "This Pokemon's Normal-type moves become Grass type and have 1.2x power.",
	},
	fightingspirit: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				"judgment",
				"multiattack",
				"naturalgift",
				"revelationdance",
				"technoblast",
				"terrainpulse",
				"weatherball",
			];
			if (
				move.type === "Normal" &&
				!noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== "Status") &&
				!(move.name === "Tera Blast" && pokemon.terastallized)
			) {
				move.type = "Fighting";
				move.typeChangerBoosted = this.effect;
			}
		},
		onModifyDamage(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) { return this.chainModify(1.2); }
		},
		name: "Fighting Spirit",
		rating: 4,
		num: 331,
		gen: 8,
		shortDesc: "This Pokemon's Normal-type moves become Fighting type and have 1.2x power.",
	},
	firescales: {
		onSourceModifyDamage(damage, source, target, move) {
			if (move.category === "Special") {
				return this.chainModify(0.5);
			}
		},
		flags: {breakable: 1},
		name: "Fire Scales",
		shortDesc: "Halves damage taken by Special moves. Does NOT double Sp.Def.",
	},
	flamingmaw: {
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.flags["bite"]) {
				return this.chainModify(1.5);
			}
		},
		onModifyMove(move, mon, target) {
			if (!move?.flags["bite"]) return;
			if (move.secondaries) move.secondaries = [];
			move.secondaries?.push({
				chance: 50,
				status: "brn",
			});
		},
		name: "Flaming Maw",
		shortDesc: "This Pokemon's bite-based attacks have 1.5x power and have a 50% chance to burn.",

	},
	freezingpoint: {
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target)) {
				if (this.randomChance(3, 10)) {
					source.trySetStatus("fbt", target);
				}
			}
		},
		onModifyMove(move) {
			if (!move?.flags["contact"] || move.target === "self") return;
			if (!move.secondaries) {
				move.secondaries = [];
			}
			move.secondaries.push({
				chance: 30,
				status: "fbt",
				ability: this.dex.abilities.get("freezinpoint"),
			});
		},
		flags: {},
		name: "Freezing Point",
		rating: 2,
		num: 143,
		shortDesc: "This Pokemon's contact moves have a 30% chance of inflicting frostbite.",
	},
	frostburn: {
		onAfterMove(source, target, move) {
			if (move.type !== "Fire") { return; }
			if (!move.succeeded) return;
			const moveMutations = {
				basePower: 40,
			};
			this.actions.runAdditionalMove(
				Dex.moves.get("icebeam"),
				source,
				target,
				moveMutations
			);
		},
		name: "Frost Burn",
		shortDesc: "This Pokemon attacks with a 40bp Ice Beam after using a Fire-type move.",
	},
	frozensoul: {
		onModifyPriority(priority, pokemon, target, move) {
			if (move?.type === "Ice" && pokemon.hp === pokemon.maxhp) { return priority + 1; }
		},
		name: "Frozen Soul",
		rating: 1.5,
		num: 377,
		gen: 8,
		shortDesc: "If this Pokemon is at full HP, its Ice-type moves have their priority increased by 1.",
	},
	giantwings: {
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.flags["wind"]) {
				this.debug("Giant Wings boost");
				return this.chainModify(1.25);
			}
		},
		name: "Giant Wings",
		rating: 3,
		num: 384,
		gen: 8,
		shortDesc: "This Pokemon's wind moves are boosted 1.25x.",
	},
	grippincer: {
		onAfterMoveSecondarySelf(source, target, move) {
			if (!move || !target || source.switchFlag === true) return;
			if (
				target !== source &&
				move.flags["contact"] &&
				this.randomChance(5, 10)
			) {
				target.addVolatile(
					"partiallytrapped",
					source,
					this.dex.abilities.getByID("grippincer" as ID)
				);
			}
		},
		onModifyMove(move, pokemon, target) {
			if (target?.volatiles["partiallytrapped"]) {
				move.ignoreEvasion = true;
				move.ignoreDefensive = true;
			}
		},
		name: "Grip Pincer",
		rating: 4,
		num: 386,
		gen: 8,
		shortDesc: "Contact moves have a 50% chance to trap. Ignores Def & Accuracy checks against trapped foe(s).",
	},
	guilttrip: {
		onDamagingHitOrder: 2,
		onDamagingHit(damage, target, source, move) {
			if (!target.hp) {
				this.add("-ability", target, "Guilt Trip");
				this.boost({spa: -2}, source, target, null, true);
				this.boost({atk: -2}, source, target, null, true);
			}
		},
		name: "Guilt Trip",
		gen: 8,
		shortDesc: "Sharply lowers foe's Attack and Sp. Atk when fainting.",
	},
	hauntingfrenzy: {
		onModifyMove(move) {
			if (!move.secondaries) {
				move.secondaries = [];
			}
			move.secondaries.push({
				chance: 20,
				volatileStatus: "flinch",
			});
		},
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === "Move") {
				this.boost({spe: 1}, source);
			}
		},
		name: "Haunting Frenzy",
		rating: 3.5,
		num: 371,
		gen: 9,
		shortDesc: "This Pokemon's attacks have a 20% chance to flinch and has Speed raised by 1 stage if it knocks out a foe.",
	},
	higherrank: {
		onBasePowerPriority: 30,
		onBasePower(basePower, attacker, defender, move) {
			if (move.priority > 0) {
				return this.chainModify(1.2);
			}
		},
		name: "Higher Rank",
		rating: 3,
		num: -108,
		shortDesc: "This Pokemon's priority moves have 1.2x power.",
	},
	hydrocircuit: {
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.type === "Electric") {
				return this.chainModify(1.5);
			}
		},
		onModifyMove(move) {
			if (move.type === "Water") {
				move.drain = [1, 4];
			}
		},
		name: "Hydro Circuit",
		rating: 3,
		num: 436,
		gen: 8,
		shortDesc: "This Pokemon's Electric moves are boosted by 50%; Water moves drain 25% damge",
	},
	hyperaggressive: {
		onPrepareHit(source, target, move) {
			if (isParentalBondBanned(move, source)) { return; }
			move.multihit = 2;
			move.multihitType = "parentalbond";
		},
		onSourceModifySecondaries(secondaries, target, source, move) {
			console.log(move.hit, move.secondaries);
			if (move.multihitType !== "parentalbond") return;
			if (!secondaries) return;
			if (move.hit <= 1) return;
			secondaries = secondaries.filter((effect) => effect.volatileStatus !== "flinch" || effect.ability || effect.kingsrock);
			return secondaries;
		},
		name: "Hyper Aggressive",
		rating: 4.5,
		num: 373,
		gen: 8,
		shortDesc: "This Pokemon's damaging moves hit twice. The second hit has 0.25x power.",
	},
	illwill: {
		onFaint(target, source, effect) {
			if (effect.effectType === "Move") {
				this.add("-ability", target, "Ill Will");
				this.add(
					"-message",
					target.name + " deleted the PP of " + effect.name + "!"
				);
				target.side.foe.active[0].moveSlots.forEach((slot) => {
					if (slot.id === effect.id) {
						slot.pp = 0;
					}
				});
			}
		},
		name: "Ill Will",
		rating: 2,
		num: 371,
		gen: 9,
		shortDesc: "User deletes the PP of the move that KOs this Pokemon.",
	},
	immolate: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				"judgment",
				"multiattack",
				"naturalgift",
				"revelationdance",
				"technoblast",
				"terrainpulse",
				"weatherball",
			];
			if (
				move.type === "Normal" &&
				!noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== "Status") &&
				!(move.name === "Tera Blast" && pokemon.terastallized)
			) {
				move.type = "Fire";
				move.typeChangerBoosted = this.effect;
			}
		},
		onModifyDamage(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) { return this.chainModify(1.2); }
		},
		name: "Immolate",
		rating: 4,
		num: 311,
		gen: 8,
		shortDesc: "This Pokemon's Normal-type moves become Fire type and have 1.2x power.",
	},
	impenetrable: {
		onDamage(damage, target, source, effect) {
			if (effect.effectType !== "Move") {
				if (effect.effectType === "Ability") { this.add("-activate", source, "ability: " + effect.name); }
				return false;
			}
		},
		name: "Impenetrable",
		rating: 4,
		num: 355,
		gen: 8,
		shortDesc: "This Pokemon can only be damaged by direct attacks.",
	},
	impulse: {
		onModifyMove(move) {
			if (!move.flags["contact"]) {
				move.overrideOffensiveStat = "spe";
			}
		},
		name: "Impulse",
		rating: 3.5,
		num: 371,
		gen: 9,
		shortDesc: "Non-contact moves use the Speed stat for damage.",
	},
	inflatable: {
		onTryHit(target, source, move) {
			if (
				target !== source &&
				(move.type === "Flying" || move.type === "Fire")
			) {
				if (!this.boost({def: 1, spd: 1})) {
					this.add("-immune", target, "[from] ability: Inflatable");
					return null;
				}
			}
		},
		flags: {breakable: 1},
		name: "Inflatable",
		rating: 3,
		num: 320,
		gen: 8,
		shortDesc: "This Pokemon's Def and Sp. Def are raised by 1 stage after it is hit by a Fire or Flying-type move.",
	},
	juggernaut: {
		onModifyAtkPriority: 11,
		onModifyMove(move) {
			if (move.flags["contact"]) move.secondaryOffensiveStats = [["def", 0.2]];
		},
		onUpdate(pokemon) {
			if (pokemon.status === "par") {
				this.add("-activate", pokemon, "ability: Juggernaut");
				pokemon.cureStatus();
			}
		},
		onSetStatus(status, target, source, effect) {
			if (status.id !== "par") return;
			if ((effect as Move)?.status) {
				this.add("-immune", target, "[from] ability: Juggernaut");
			}
			return false;
		},
		flags: {breakable: 1},
		name: "Juggernaut",
		rating: 3.5,
		num: 350,
		gen: 8,
		shortDesc: "Uses 20% of its Def when using a contact move. Immune to Paralysis",
	},
	looserocks: {
		onDamagingHit(damage, target, source, move) {
			const side = target.side.foe;
			if (!move.flags["contact"]) return;
			const stealthrock = side.sideConditions["stealthrock"];
			if (stealthrock) return;
			this.add("-activate", target, "ability: Loose Rocks");
			side.addSideCondition("stealthrock", target);
		},
		name: "Loose Rocks",
		rating: 3.5,
		num: 418,
		gen: 8,
		shortDesc: "Lays Stealth Rocks when hit by a contact move.",
	},
	loudbang: {
		onModifyMove(move, attacker, defender) {
			if (move.category !== "Status" && move.flags["sound"]) {
				if (!move.secondaries) move.secondaries = [];
				move.secondaries.push({
					chance: 50,
					volatileStatus: "confusion",
					ability: this.dex.abilities.get("loudbang"),
				});
			}
		},
		name: "Loud Bang",
		rating: 2,
		num: 325,
		gen: 8,
		shortDesc: "This pokemon's sound-based moves have 50% chance to inflict confusion",
	},
	lowblow: {
		onStart(pokemon) {
			const target = pokemon.oppositeFoe();
			if (!target) return;
			this.actions.runAdditionalMove(
				Dex.moves.get("feintattack"),
				pokemon,
				target,
				{
					onDamagePriority: -20,
					onDamage: (damage: number, moveTarget: Pokemon) => {
						if (damage >= moveTarget.hp) return moveTarget.hp - 1;
					},
				},
			);
		},
		name: "Low Blow",
		rating: 3,
		num: 408,
		gen: 8,
		shortDesc: "User attacks with 40BP Feint Attack on switch-in.",
	},
	marineapex: {
		onModifyMove(move) {
			move.infiltrates = true;
		},
		onModifyDamage(damage, source, target, move) {
			if (target.hasType("Water")) {
				this.debug("Marine Apex boost");
				return this.chainModify(1.5);
			}
		},

		name: "Marine Apex",
		rating: 3,
		num: 406,
		gen: 8,
		shortDesc: "This Pokemon deals 50% more damage to Water-types; ignores substitute and screens.",
	},
	mightyhorn: {
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.flags["horn"]) {
				this.debug("Mighty Horn boost");
				return this.chainModify([5325, 4096]);
			}
		},
		name: "Mighty Horn",
		rating: 3,
		num: 397,
		gen: 8,
		shortDesc: "Boosts the power of horn and drill-based moves by 1.3x.",
	},
	minioncontrol: {
		onPrepareHit(source, target, move) {
			if (
				move.category === "Status" ||
				move.multihit ||
				move.flags["noparentalbond"] ||
				move.flags["charge"] ||
				move.flags["futuremove"] ||
				move.spreadHit ||
				move.isZ ||
				move.isMax
			) { return; }

			let allyCount = 0;
			for (const ally of source.side.pokemon) {
				if (ally !== source) {
					if (ally.hp > 0) {
						allyCount++;
					}
				}
			}
			move.multihit = allyCount;
			move.multihitType = "parentalbond";
		},
		// Damage modifier implemented in BattleActions#modifyDamage() NEED TO ADD
		onSourceModifySecondaries(secondaries, target, source, move) {
			if (
				move.multihitType === "parentalbond" &&
				move.id === "secretpower" &&
				move.hit < 2
			) {
				return secondaries.filter(
					(effect) => effect.volatileStatus === "flinch"
				);
			}
		},
		name: "Minion Control",
		rating: 5,
		num: 378,
		gen: 9,
		shortDesc: "Moves hit an extra time for each healthy party member.",
	},
	moltenblades: {
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.flags["slicing"]) {
				return this.chainModify([5325, 4096]);
			}
		},
		onModifyMove(move) {
			if (move.flags["slicing"]) {
				if (!move.secondaries) {
					move.secondaries = [];
				}
				move.secondaries.push({
					chance: 20,
					status: "brn",
					ability: this.dex.abilities.get("moltenblades"),
				});
			}
		},
		name: "Molten Blades",
		shortDesc: "This Pokemon's slicing moves have their power boosted 1.3x and have a 20% chance to burn.",
	},
	moonspirit: {
		onModifyMove(move) {
			if (move.type === "Fairy" || move.type === "Dark") {
				move.forceSTAB = true;
			}
		},
		// Moonlight effectiveness implemented in moves file NEED TO ADD
		name: "Moon Spirit",
		gen: 9,
		shortDesc: "Fairy & Dark gains STAB. Moonlight recovers 75% HP.",
	},
	moshpit: {
		onAllyBasePowerPriority: 22,
		onAllyBasePower(basePower, attacker, defender, move) {
			if (move.recoil || move.hasCrashDamage) {
				this.debug('Mosh Pit boost');
				return this.chainModify(1.5);
			}  else {
				this.debug('Mosh Pit boost');
				return this.chainModify(1.2);
			}
		},
		flags: {},
		name: "Steely Spirit",
		rating: 3.5,
		num: 252,
		shortDesc: "Allies attacks have 1.25x power, 1.5x power if they inflict recoil.",

	},
	mysticblades: {
		onModifyMove(move) {
			if (move.flags["slicing"]) {
				move.overrideDefensiveStat = "spd";
				move.overrideOffensiveStat = "spa";
			}
		},
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.flags["slicing"]) {
				this.debug("Mystic Blades boost");
				return this.chainModify(1.3);
			}
		},
		name: "Mystic Blades",
		shortDesc: "Keen edge moves become Special and deal 30% more damage.",
	},
	mysticpower: {
		onModifyMove(move) {
			move.forceSTAB = true;
		},
		name: "Mystic Power",
		rating: 4.5,
		num: 317,
		gen: 8,
		shortDesc: "All moves used by this Pokemon are STAB boosted.",
	},
	naturalrecovery: {
		onCheckShow(pokemon) {
			// This is complicated
			// For the most part, in-game, it's obvious whether or not Natural Cure activated,
			// since you can see how many of your opponent's pokemon are statused.
			// The only ambiguous situation happens in Doubles/Triples, where multiple pokemon
			// that could have Natural Cure switch out, but only some of them get cured.
			if (pokemon.side.active.length === 1) return;
			if (pokemon.showCure === true || pokemon.showCure === false) return;

			const cureList = [];
			let noCureCount = 0;
			for (const curPoke of pokemon.side.active) {
				// pokemon not statused
				if (!curPoke?.status) {
					// this.add('-message', "" + curPoke + " skipped: not statused or doesn't exist");
					continue;
				}
				if (curPoke.showCure) {
					// this.add('-message', "" + curPoke + " skipped: Natural Cure already known");
					continue;
				}
				const species = curPoke.species;
				// pokemon can't get Natural Cure
				if (!Object.values(species.abilities).includes("Natural Cure")) {
					// this.add('-message', "" + curPoke + " skipped: no Natural Cure");
					continue;
				}
				// pokemon's ability is known to be Natural Cure
				if (!species.abilities["1"] && !species.abilities["H"]) {
					// this.add('-message', "" + curPoke + " skipped: only one ability");
					continue;
				}
				// pokemon isn't switching this turn
				if (curPoke !== pokemon && !this.queue.willSwitch(curPoke)) {
					// this.add('-message', "" + curPoke + " skipped: not switching");
					continue;
				}

				if (curPoke.hasAbility("naturalcure")) {
					// this.add('-message', "" + curPoke + " confirmed: could be Natural Cure (and is)");
					cureList.push(curPoke);
				} else {
					// this.add('-message', "" + curPoke + " confirmed: could be Natural Cure (but isn't)");
					noCureCount++;
				}
			}

			if (!cureList.length || !noCureCount) {
				// It's possible to know what pokemon were cured
				for (const pkmn of cureList) {
					pkmn.showCure = true;
				}
			} else {
				// It's not possible to know what pokemon were cured

				// Unlike a -hint, this is real information that battlers need, so we use a -message
				this.add(
					"-message",
					"(" +
						cureList.length +
						" of " +
						pokemon.side.name +
						"'s pokemon " +
						(cureList.length === 1 ? "was" : "were") +
						" cured by Natural Cure.)"
				);

				for (const pkmn of cureList) {
					pkmn.showCure = false;
				}
			}
		},
		onSwitchOut(pokemon) {
			if (!pokemon.foes().some(it => it.hasAbility("permanence"))) {
				pokemon.heal(pokemon.baseMaxhp / 3);
			}
			if (!pokemon.status) return;

			// if pokemon.showCure is undefined, it was skipped because its ability
			// is known
			if (pokemon.showCure === undefined) pokemon.showCure = true;

			if (pokemon.showCure) {
				this.add(
					"-curestatus",
					pokemon,
					pokemon.status,
					"[from] ability: Natural Cure"
				);
			}
			pokemon.clearStatus();

			// only reset .showCure if it's false
			// (once you know a Pokemon has Natural Cure, its cures are always known)
			if (!pokemon.showCure) pokemon.showCure = undefined;
		},
		name: "Natural Recovery",
		gen: 8,
		shortDesc: "Combines Natural Cure & Regenerator.",
	},
	nika: {
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.flags["punch"]) {
				this.debug("Iron Fist boost");
				this.chainModify(1.3);
			}

			if (move.type === "Water" && this.field.weather === "sunnyday") {
				this.debug("water sun boost offset");
				this.chainModify(1.5);
			}
		},
		name: "Nika",
		gen: 8,
		shortDesc: "Iron fist + Water moves function normally under sun.",
	},
	noisecancel: {
		onAllyTryHit(target, source, move) {
			if (target !== source && move.flags["sound"]) {
				this.add("-immune", target, "[from] ability: Noise Cancel");
				return null;
			}
		},
		onAllyTryHitSide(target, source, move) {
			if (move.flags["sound"]) {
				this.add(
					"-immune",
					this.effectState.target,
					"[from] ability: Noise Cancel"
				);
			}
		},
		flags: {breakable: 1},
		name: "Noise Cancel",
		rating: 3,
		num: 378,
		gen: 9,
		shortDesc: "This Pokemon and its allies are immune to sound-based moves.",
	},
	noturningback: {
		onStart(pokemon) {
			let activated = false;
			if (!activated) {
				this.add('-ability', pokemon, 'No Turning Back', 'boost');
				activated = true;
			} else {
				this.boost({atk: 1, def: 1, spa: 1, spd: 1, spe: 1}, pokemon);
			}
		},
		onTrapPokemon(pokemon) {
			if (pokemon.hp <= pokemon.maxhp / 2) {
				pokemon.tryTrap();
			}
		},
		flags: {},
		name: "No Turning Back",
		rating: 3,
		num: 61,
		shortDesc: "This Pokemon boosts all stats on entry, but cannot retreat when below 1/2 max hp.",
	},
	overcharge: {
		onModifyMove(move) {
			const baseEffectiveness = move.onEffectiveness;
			move.onEffectiveness = (effectiveness, target, type, usedMove) => {
				if (usedMove.type === 'Electric' && type === 'Electric') return 1;
				return baseEffectiveness?.apply(this, [effectiveness, target, type, usedMove]);
			};
		},
		// Electric type paralysis implemented in sim/pokemon.js:setStatus
		name: "Overcharge",
		rating: 3,
		num: 364,
		gen: 8,
		shortDesc: "Electric type moves are super effective vs Electric and can paralyze.",

	},
	overwhelm: {
		onModifyMovePriority: -5,
		onModifyMove(move, attacker, defender) {
			if (!move.ignoreImmunity) move.ignoreImmunity = {};
			if (move.ignoreImmunity !== true) {
				move.ignoreImmunity["Dragon"] = true;
			}
		},
		onTryBoost(boost, target, source, effect) {
			if (effect.name === "Intimidate" && boost.atk) {
				delete boost.atk;
				this.add(
					"-fail",
					target,
					"unboost",
					"Attack",
					"[from] ability: Overwhelm",
					"[of] " + target
				);
			}
			if (effect.name === "Scare" && boost.spa) {
				delete boost.spa;
				this.add(
					"-fail",
					target,
					"unboost",
					"Special Attack",
					"[from] ability: Overwhelm",
					"[of] " + target
				);
			}
		},
		name: "Overwhelm",
		rating: 4,
		num: 357,
		gen: 8,
		shortDesc: "User ignores Dragon type immunity. Immune to Intimidate and Scare.",
	},
	phantompain: {
		onModifyMovePriority: -5,
		onModifyMove(move) {
			if (!move.ignoreImmunity) move.ignoreImmunity = {};
			if (
				move.ignoreImmunity !== true &&
				!Object.keys(move.ignoreImmunity).includes("Ghost")
			) {
				move.ignoreImmunity["Ghost"] = true;
			}
		},
		name: "Phantom Pain",
		rating: 3,
		num: 457,
		gen: 8,
		shortDesc: "Ghost type moves can hit Normal types.",
	},
	piercingsolo: {
		onModifyMove(move, mon, target) {
			if (!move?.flags["sound"]) return;
			if (move.secondaries) move.secondaries = [];
			move.secondaries?.push({
				chance: 100,
				status: "bld",
			});
		},
		name: "Piercing Solo",
		shortDesc: "This Pokemon's sound-based attacks inflict bleeding.",

	},
	powercore: {
		onModifyMove(move) {
			if (move.category === 'Physical') move.secondaryOffensiveStats = [['def', 0.2]];
			else if (move.category === 'Special') move.secondaryOffensiveStats = [['spd', 0.2]];
		},
		name: "Power Core",
		rating: 3.5,
		num: 380,
		gen: 8,
		shortDesc: "The Pokémon uses +20% of its Defense or SpDef during moves.",
	},
	powermetal: {
		onModifyType(move, pokemon) {
			if (move.flags["sound"] && move.type === "Normal" && !pokemon.volatiles["dynamax"]) {
				// hardcode
				move.type = "Steel";
				move.typeChangerBoosted = this.effect;
			}
		},
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.flags["sound"] && move.typeChangerBoosted) {
				return this.chainModify(1.2);
			}
		},
		flags: {},
		name: "Power Metal",
		rating: 1.5,
		num: 204,
		shortDesc: "This Pokemon's sound-based moves have 1.2x power become Steel-type if Normal.",
	},
	precisefist: {
		onModifyMove(move) {
			if (move.flags["punch"]) {
				if (move.secondaries) {
					this.debug("doubling secondary chance");
					for (const secondary of move.secondaries) {
						if (secondary.chance) secondary.chance *= 2;
					}
				}
				if (move.secondary) {
					this.debug("doubling secondary chance");
					if (move.secondary.chance) move.secondary.chance *= 2;
				}
				if (move.self?.chance) move.self.chance *= 2;
			}
		},
		onModifyCritRatio(critRatio, source, target, move) {
			if (move.flags["punch"]) return critRatio + 1;
		},
		name: "Precise Fist",
		rating: 2.5,
		num: 388,
		gen: 8,
		shortDesc: "This Pokemon's punching moves have double secondary effect chance and have +1 crit ratio",
	},
	predator: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === "Move") {
				this.add("-activate", source, "Predator");
				source.heal(source.baseMaxhp / 4);
				this.add("-heal", source, source.getHealth, "[silent]");
			}
		},
		name: "Predator",
		rating: 3,
		num: 378,
		gen: 9,
		shortDesc: "The user restores 1/4 of its maximum HP if it attacks and KOes another Pokemon",
	},
	presto: {
		onModifyPriority(priority, pokemon, target, move) {
			if (move.flags['sound'] && pokemon.hp === pokemon.maxhp) return priority + 1;
		},
		flags: {},
		name: "Presto",
		rating: 1.5,
		num: 177,
		shortDesc: "If this Pokemon is at full HP, its Sound-based moves have their priority increased by 1.",

	},
	primalmaw: {
		// Uses parentalBond as base.
		onPrepareHit(source, target, move) {
			if (isParentalBondBanned(move, source)) { return; }
			if (move.flags["bite"]) {
				move.multihit = 2;
				move.multihitType = "parentalbond";
			}
		},
		onSourceModifySecondaries(secondaries, target, source, move) {
			console.log(move.hit, move.secondaries);
			if (move.multihitType !== "parentalbond") return;
			if (!secondaries) return;
			if (move.hit <= 1) return;
			secondaries = secondaries.filter((effect) => effect.volatileStatus !== "flinch" || effect.ability || effect.kingsrock);
			return secondaries;
		},
		name: "Primal Maw",
		rating: 3,
		num: 433,
		gen: 8,
		shortDesc: "This Pokemon's biting moves hit twice. The second hit has its damage halved.",
	},
	pyromancy: {
		onModifyMovePriority: -2,
		onModifyMove(move) {
			if (move.secondaries) {
				this.debug("quintupling burn chance");
				for (const secondary of move.secondaries) {
					if (secondary.status?.includes("brn") && secondary.chance && !secondary.ability) { secondary.chance *= 5; }
				}
			}
		},
		name: "Pyromancy",
		rating: 3.5,
		num: 300,
		gen: 8,
		shortDesc: "Moves with a chance to inflict burn 5x as often.",
	},
	queensmourning: {
		onAllyAfterEachBoost(boost, target, source, abilitySource) {
			let statsLowered = false;
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! < 0) {
					statsLowered = true;
				}
			}
			if (statsLowered && abilitySource instanceof Pokemon) {
				this.boost({spa: 1, spd: 1}, abilitySource, abilitySource, null, false, true);
			}
		},
		name: "Queens's Mourning",
		rating: 4,
		num: 425,
		gen: 8,
		shortDesc: "Lowering any stats on the user's side raises SpAtk and SpDef.",
	},
	radiance: {
		onSourceModifyAccuracyPriority: -1,
		onSourceModifyAccuracy(accuracy) {
			if (typeof accuracy !== "number") return;
			this.debug("radiance - enhancing accuracy");
			return this.chainModify(1.2);
		},
		onAnyTryMove(source, target, move) {
			if (move.type === "Dark") {
				this.attrLastMove("[still]");
				this.add(
					"cant",
					this.effectState.target,
					"ability: Radiance",
					move,
					"[of] " + target
				);
				return false;
			}
		},
		flags: {breakable: 1},
		name: "Radiance",
		rating: 3,
		num: 446,
		gen: 8,
		shortDesc: "Dark moves fail when this Pokemon is active. User has 1.2x accuracy",
	},
	radiojam: {
		onDamagingHit(damage, target, source, move) {
			if (move.flags["sound"]) {
				target.addVolatile("disable", source);
			}
		},
		name: "Radio Jam",
		rating: 2,
		num: 300,
		gen: 8,
		shortDesc: "If this Pokemon is hit by an sound-based move, that move gets disabled.",
	},
	ragingboxer: {
		// Uses parentalBond as base.
		onPrepareHit(source, target, move) {
			if (move.flags["punch"]) {
				move.multihit = 2;
				move.multihitType = "parentalbond";
			}
		},
		onSourceModifySecondaries(secondaries, target, source, move) {
			console.log(move.hit, move.secondaries);
			if (move.multihitType !== "parentalbond") return;
			if (!secondaries) return;
			if (move.hit <= 1) return;
			secondaries = secondaries.filter((effect) => effect.volatileStatus !== "flinch" || effect.ability || effect.kingsrock);
			return secondaries;
		},
		name: "Raging Boxer",
		rating: 4.5,
		num: 348,
		gen: 8,
		shortDesc: "Punching moves hit twice. The 2nd hit has 40% power.",
	},
	relentless: {
		onModifyDamage(basePower, attacker, defender, move) {
			if (defender.status) {
				return this.chainModify(1.25);
			}
		},
		onModifyCritRatio(critRatio, source, target) {
			if (target && ['psn', 'tox'].includes(target.status)) return 5;
		},
		name: "Relentless",
		rating: 2,
		num: 315,
		gen: 9,
		shortDesc: "This Pokemon's move power is 1.25x if the target is statused; garunteed crit against poisoned foe(s).",
	},
	rhytmic: {
		onStart(pokemon) {
			pokemon.addVolatile('pendulum');
		},
		condition: {
			onStart(pokemon) {
				this.effectState.lastMove = '';
				this.effectState.numConsecutive = 0;
			},
			onTryMovePriority: -2,
			onTryMove(pokemon, target, move) {
				if (!pokemon.hasAbility('pendulum')) {
					pokemon.removeVolatile('pendulum');
					return;
				}
				if (this.effectState.lastMove === move.id && pokemon.moveLastTurnResult) {
					this.effectState.numConsecutive++;
				} else if (pokemon.volatiles['twoturnmove'] && this.effectState.lastMove !== move.id) {
					this.effectState.numConsecutive = 1;
				} else {
					this.effectState.numConsecutive = 0;
				}
				this.effectState.lastMove = move.id;
			},
			onModifyDamage(damage, source, target, move) {
				const dmgMod = [4096, 4915, 5734, 6553, 7372, 8192];
				const numConsecutive = this.effectState.numConsecutive > 5 ? 5 : this.effectState.numConsecutive;
				this.debug(`Current Rhythmic boost: ${dmgMod[numConsecutive]}/4096`);
				return this.chainModify([dmgMod[numConsecutive], 4096]);
			},
		},
		name: "Rhythmic",
		gen: 6,
		rating: 4.5,
		num: 21,
		shortDesc: "Consecutively using the same move increases its damage.",
	},
	rosegarden: {
		onStart(pokemon) {
			const side = pokemon.side.foe;
			const toxicSpikes = side.sideConditions["toxicspikes"];
			if (!toxicSpikes || toxicSpikes.layers < 2) {
				this.add("-activate", pokemon, "ability: Rose Garden");
				side.addSideCondition("toxicspikes", pokemon);
			}
			if (!toxicSpikes || toxicSpikes.layers < 2) {
				this.add("-activate", pokemon, "ability: Rose Garden");
				side.addSideCondition("toxicspikes", pokemon);
			}
		},
		name: "Rose Garden",
		shortDesc: "Spreads two layers of Toxic Spikes on switch-in.",
	},
	samba: {
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.flags["kick"]) {
				this.debug("Striker boost");
				return this.chainModify(1.3);
			}
		},
		//Need to hardcode in movesets with dancer.
		name: "Samba",
		rating: 3,
		num: 376,
		gen: 8,
		shortDesc: "After another Pokemon uses a dance move, this Pokemon uses the same move. Kicking moves are boosted by 30%",
	},
	sandbender: {
		onStart(source) {
			this.field.setWeather('sandstorm');
		},
		onBasePowerPriority: 21,
		onBasePower(basePower, attacker, defender, move) {
			if (this.field.isWeather('sandstorm')) {
				if (move.type === 'Rock' || move.type === 'Ground' || move.type === 'Steel') {
					this.debug('Sand Force boost');
					return this.chainModify([5325, 4096]);
				}
			}
		},
		onImmunity(type, pokemon) {
			if (type === 'sandstorm') return false;
		},
		flags: {},
		name: "Sand Bender",
		rating: 4,
		num: 45,
		shortDesc: "Summons sandstorm on switch-in. Ground/Rock/Steel attacks do 1.3x in Sandstorm; immunity to it.",
	},
	sandpit: {
		onStart(pokemon) {
			const target = pokemon.oppositeFoe();
			if (!target) return;

			const move = this.dex.deepClone(this.dex.moves.get("sandtomb"));
			move.basePower = 20;

			this.actions.runAdditionalMove(move, pokemon, target);
		},
		name: "Sand Pit",
		rating: 4,
		num: 405,
		gen: 8,
		shortDesc: "Attacks with 20BP Sand Tomb on switch-in.",
	},
	seaguardian: {
		onStart(pokemon) {
			if (
				["raindance", "primordialsea"].includes(pokemon.effectiveWeather())
			) {
				const bestStat = pokemon.getBestStat(true, true);
				this.boost({[bestStat]: 1}, pokemon);
			}
		},
		name: "Sea Guardian",
		rating: 3.5,
		num: 371,
		gen: 9,
		shortDesc: "If Rain Dance is active, this Pokemon's highest stat is raised by 1 stage on switch-in.",
	},
	selfsufficient: {
		onResidualOrder: 29,
		onResidualSubOrder: 4,
		onResidual(pokemon) {
			this.heal(pokemon.baseMaxhp / 16);
		},
		name: "Self Sufficient",
		rating: 4,
		num: 337,
		gen: 8,
		shortDesc: "This Pokemon heals 1/16 HP each turn",
	},
	scare: {
		onStart(pokemon) {
			let activated = false;
			for (const target of pokemon.adjacentFoes()) {
				if (!activated) {
					this.add('-ability', pokemon, 'Scare', 'boost');
					activated = true;
				}
				if (target.volatiles['substitute']) {
					this.add('-immune', target);
				} else {
					this.boost({spa: -1}, target, pokemon, null, true);
				}
			}
		},
		name: "Scare",
		rating: 3.5,
		num: 269,
		shortDesc: "On switch-in, this Pokemon lowers the Sp. Atk of adjacent opponents by 1 stage.",
	},
	shockingjaws: {
		onModifyMove(move, mon, target) {
			if (!move?.flags["bite"]) return;
			if (move.secondaries) move.secondaries = [];
			move.secondaries?.push({
				chance: 50,
				status: "par",
				ability: this.dex.abilities.get("shockingjaws"),
			});
		},
		name: "Shocking Jaws",
		rating: 3,
		num: 455,
		gen: 8,
		shortDesc: "Biting moves have a 50% chance to paralyze the target.",
	},
	snowywrath: {
		onStart(source) {
			this.field.setWeather("snow");
		},
		onModifyMovePriority: -2,
		onModifyMove(move) {
			if (!move.secondaries) return;
			for (const secondary of move.secondaries) {
				if (secondary.status?.includes("frz") && secondary.chance && !secondary.ability) { secondary.chance *= 5; }
			}
		},
		name: "Cryomancy",
		rating: 3,
		num: 456,
		gen: 8,
		shortDesc: "This Pokemon summons Snow on entry and it's moves have a 5x chance to frostbite",

	},
	soothingaroma: {
		onStart(pokemon) {
			for (const ally of pokemon.side.pokemon) {
				if (ally !== pokemon) {
					ally.cureStatus();
				}
			}
		},
		name: "Soothing Aroma",
		num: 269,
		shortDesc: "Cures party status on entry.",
	},
	soulddevourer: {
		onModifyMovePriority: -5,
		onModifyMove(move) {
			if (!move.ignoreImmunity) move.ignoreImmunity = {};
			if (
				move.ignoreImmunity !== true &&
				!Object.keys(move.ignoreImmunity).includes("Ghost")
			) {
				move.ignoreImmunity["Ghost"] = true;
			}
		},
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === "Move") {
				this.add("-activate", source, "Soul Eater");
				source.heal(source.baseMaxhp / 4);
				this.add("-heal", source, source.getHealth, "[silent]");
			}
		},
		name: "Soul Devourer",
		rating: 3,
		num: 457,
		gen: 8,
		shortDesc: "This Pokemon's regains 1/4 of its max HP if it KOes another Pokemon. Ghost type moves hit Normal types.",
	},
	souleater: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === "Move") {
				this.add("-activate", source, "Soul Eater");
				source.heal(source.baseMaxhp / 4);
				this.add("-heal", source, source.getHealth, "[silent]");
			}
		},
		name: "Soul Eater",
		rating: 3,
		num: 360,
		gen: 8,
		shortDesc: "This Pokemon's regains 1/4 of its max HP if it attacks and KOes another Pokemon.",
	},
	speedforce: {
		onModifyMove(move) {
			if (move.flags["contact"]) move.secondaryOffensiveStats = [["spe", 0.2]];
		},
		name: "Speed Force",
		rating: 4,
		num: 370,
		gen: 8,
		shortDesc: "This Pokemon's contact moves add 20% of Speed during damage calculation",
	},
	spiderlair: {
		onStart(source) {
			// duration handled in data/moves.js:stickyweb
			const hasWebs = source.side.foe.sideConditions["stickyweb"];
			if (!hasWebs) {
				// I don't think Spider Lair checks for Magic Bounce, so I get away with addSideCondition here (maybe???)
				this.add("-activate", source, "ability: Spider Lair");
				source.side.foe.addSideCondition(
					"stickyweb",
					source,
					source.getAbility()
				);
			}
		},
		name: "Spider Lair",
		rating: 4.5,
		num: 900,
		gen: 8,
		shortDesc: "This Pokemon casts Sticky Web on entry."
	},
	striker: {
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.flags["kick"]) {
				this.debug("Striker boost");
				return this.chainModify(1.3);
			}
		},
		name: "Striker",
		rating: 3,
		num: 376,
		gen: 8,
		shortDesc: "This Pokemon's kicking moves are boosted by 30%",
	},
	superconductor: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				"judgment",
				"multiattack",
				"naturalgift",
				"revelationdance",
				"technoblast",
				"terrainpulse",
				"weatherball",
			];
			if (
				move.type === "Steel" &&
				!noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== "Status") &&
				!(move.name === "Tera Blast" && pokemon.terastallized)
			) {
				move.type = "Electric";
				move.typeChangerBoosted = this.effect;
			}
		},
		onModifyDamage(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) { return this.chainModify(1.1); }
		},
		name: "Superconductor",
		rating: 4,
		num: 600,
		shortDesc: "This Pokemon's Steel-type moves become Electric type and have 1.2x power.",
	},
	sweepingedge: {
		onModifyMove(move) {
			if (move.flags["slicing"]) {
				move.accuracy = true;
				if (move.target === "normal" || move.target === "any") { move.target = "allAdjacentFoes"; }
			}
		},
		name: "Sweeping Edge",
		rating: 3,
		num: 434,
		gen: 8,
		shortDesc: "Slicing moves always hit. Single-target hits both foes.",
	},
	/*tacticalretreat: {
		onAfterEachBoost(boost, target, source, effect) {
			if (target.permanentAbilityState['tacticalretreat']) return;
			let statsLowered = false;
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! < 0) {
					statsLowered = true;
				}
			}
			if (statsLowered) {
				if (
					!this.canSwitch(target.side) ||
					target.forceSwitchFlag ||
					target.switchFlag
				) { return; }
				for (const side of this.sides) {
					for (const active of side.active) {
						active.switchFlag = false;
					}
				}
				target.permanentAbilityState['tacticalretreat'] = true;
				target.switchFlag = true;
				this.add("-activate", target, "ability: Tactical Retreat");
			}
		},
		name: "Tactical Retreat",
		shortDesc: "This Pokemon switches out when it's stats are lowered.",
	},*/
	telekinetic: {
		onStart(pokemon) {
			const target = pokemon.oppositeFoe();
			if (!target) return;
			this.actions.runAdditionalMove(Dex.moves.get("telekinesis"), pokemon, target);
		},
		name: "Telekinetic",
		gen: 8,
		shortDesc: "This Pokemon uses Telekinesis on entry.",
	},
	thundercall: {
		onAfterMove(source, target, move) {
			if (move.type !== "Electric") { return; }
			if (!move.succeeded) return;

			const moveMutations = {
				basePower: 120 * 0.2,
			};
			this.actions.runAdditionalMove(
				Dex.moves.get("smite"),
				source,
				target,
				moveMutations
			);
		},
		name: "Thunder Call",
		rating: 3,
		num: 405,
		gen: 8,
		shortDesc: "This Pokemon uses Smite at 20% power after using Electric-type move.",
	},
	tidalrush: {
		onModifyPriority(priority, pokemon, target, move) {
			if (move?.type === "Water" && pokemon.hp === pokemon.maxhp) { return priority + 1; }
		},
		name: "Tidal Rush",
		rating: 3,
		num: 434,
		gen: 9,
		shortDesc: "If this Pokemon is at full HP, its Water-type moves have their priority increased by 1.",
	},
	unicorn: {
		onModifyDamage(basePower, attacker, defender, move) {
			if (move.flags["horn"]) {
				this.debug("Mighty Horn boost");
				return this.chainModify([5325, 4096]);
			}
		},
		onFoeTryMove(target, source, move) {
			const targetAllExceptions = ['perishsong', 'flowershield', 'rototiller'];
			if (move.target === 'foeSide' || (move.target === 'all' && !targetAllExceptions.includes(move.id))) {
				return;
			}

			const dazzlingHolder = this.effectState.target;
			if ((source.isAlly(dazzlingHolder) || move.target === 'all') && move.priority > 0.1) {
				this.attrLastMove('[still]');
				this.add('cant', dazzlingHolder, 'ability: Unicorn', move, '[of] ' + target);
				return false;
			}
		},
		flags: {breakable: 1},
		name: "Unicorn",
		rating: 3,
		num: 397,
		gen: 8,
		shortDesc: "Boosts the power of horn and drill-based moves by 1.3x. Protects itself and allies from priority moves.",
	},
	violentrush: {
		onStart(pkmn) {
			pkmn.addVolatile("violentrush");
		},
		condition: {
			duration: 1,
			onModifyAtk(atk, source, target, move) {
				if (source.activeMoveActions < 1) {
					return this.chainModify(1.2);
				}
			},
			onModifySpe(spe, source) {
				if (source.activeMoveActions < 1) {
					return this.chainModify(1.5);
				}
			},
		},
		name: "Violent Rush",
		rating: 3.5,
		num: 365,
		gen: 8,
		shortDesc: "Boosts user's Speed by 50% and Attack by 20% on first turn out.",
	},
	volcanorage: {
		onAfterMove(source, target, move) {
			if (!(move.type === "Fire")) { return; }
			if (!move.succeeded) return;
			const moveMutations = {
				basePower: 50,
			};
			this.actions.runAdditionalMove(
				Dex.moves.get("eruption"),
				source,
				target,
				moveMutations
			);
		},
		name: "Volcano Rage",
		rating: 3,
		num: 404,
		gen: 8,
		shortDesc: "This Pokemon attacks with a 50bp Eruption after using Fire-type move.",
	},
	watchyourstep: {
		onStart(pokemon) {
			const side = pokemon.side.foe;
			const spikes = side.sideConditions["spikes"];
			if (!spikes || spikes.layers < 3) {
				this.add("-activate", pokemon, "ability: Watch your Step");
				side.addSideCondition("spikes", pokemon);
			}
			if (!spikes || spikes.layers < 3) {
				this.add("-activate", pokemon, "ability: Watch your Step");
				side.addSideCondition("spikes", pokemon);
			}
		},
		name: "Watch Your Step",
		shortDesc: "Spreads two layers of Spikes on switch-in.",
	},
	webspinner: {
		onStart(pokemon) {
			const target = pokemon.oppositeFoe();
			if (!target) return;
			this.actions.runAdditionalMove(Dex.moves.get("stringshot"), pokemon, target);
		},
		name: "Web Spinner",
		rating: 3.5,
		num: 365,
		gen: 8,
		shortDesc: "Attacks with String Shot on switch-in.",
	},
	whiteout: {
		onModifyDamage(spa, pokemon, target, move) {
			if (
				["hail", "snow"].includes(pokemon.effectiveWeather()) &&
				move.type === "Ice"
			) {
				return this.chainModify(1.5);
			}
		},
		name: "Whiteout",
		rating: 3,
		num: 299,
		gen: 8,
		shortDesc: "This pokemon's Ice moves are boosted by 50% under Hail",
	},
	windrage: {
		onSwitchIn(pokemon) {
			const nextMove = Dex.moves.get("defog");
			if (pokemon.activeMoveActions === 0) {
			this.actions.runMove(nextMove, pokemon, 0);
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['air']) {
				this.debug('Wind Rage boost');
				return this.chainModify(1.3);
			}
		},
		flags: {},
		name: "Wind Rage",
		rating: 2,
		num: 130,
		shortDesc: "Uses Defog on switch-in. Air based moves get a 1.3x boost.",
	},
	yukionna: {
		onStart(pokemon) {
			let activated = false;
			for (const target of pokemon.adjacentFoes()) {
				if (!activated) {
					this.add("-ability", pokemon, "Yuki Onna", "boost");
					activated = true;
				}
				if (target.volatiles["substitute"]) {
					this.add("-immune", target);
				} else {
					this.boost({spa: -1, atk: -1}, target, pokemon, null, true);
				}
			}
		},
		onModifyMove(move) {
			if (!move?.flags["contact"] || move.target === "self") return;
			if (!move.secondaries) {
				move.secondaries = [];
			}
			move.secondaries.push({
				chance: 10,
				status: "attract",
				ability: this.dex.abilities.get("yukionna"),
			});
		},
		name: "Yuki Onna",
		shortDesc: "On switch-in, this Pokemon lowers the Atk and Sp. Atk of opponents by 1 stage. 10% to infatuate foe on hit.",
	},
	//Emerald Z
	adhesive: {
		onDamagingHit(damage, target, source, move) {
			if (!this.checkMoveMakesContact(move, source, target)) return;

			let announced = false;
			for (const pokemon of [target, source]) {
				if (pokemon.volatiles['partiallytrapped']) continue;
				if (!announced) {
					this.add('-ability', target, 'Adhesive');
					announced = true;
				}
				pokemon.addVolatile('partiallytrapped');
			}
		},
		flags: {},
		name: "Adhesive",
		rating: 1,
		num: 253,
		shortDesc: "Making contact with this Pokemon may trap the attacker.",
	},
	bananasplit: {
		onPrepareHit(source, target, move) {
			if (
				move.category === "Status" ||
				move.multihit ||
				move.flags["noparentalbond"] ||
				move.flags["charge"] ||
				move.flags["futuremove"] ||
				move.spreadHit ||
				move.isZ ||
				move.isMax
			) { return; }
			if (move.type === 'Grass') {
				move.multihit = 2;
			}
		},
		name: "Banana Split",
		rating: 3,
		num: 433,
		gen: 9,
		shortDesc: "This Pokemon's Grass-type moves hit twice.",
	},
	courageous: {
		onStart(pkmn) {
			pkmn.addVolatile("courageous");
		},
		condition: {
			duration: 1,
			onSourceModifyDamage(damage, source, target, move) {
				if (source.activeMoveActions < 1) {
					return this.chainModify(0.50);
				}
			},
		},
		name: "Courageous",
		rating: 3.5,
		num: 365,
		gen: 8,
		shortDesc: "Halves damage recieved from attacks on first turn out.",
	},
	ferocious: {
		onTryBoost(boosts, target, source, effect) {
		  // Only block boosts if the source is an opponent
		  if (!source || source === target || !target.isAdjacent(source)) return;
	  
		  const blockedStats: BoostID[] = [];
	  
		  if (boosts.atk && boosts.atk > 0) {
			boosts.atk = 0;
			blockedStats.push('atk');
		  }
		  if (boosts.spa && boosts.spa > 0) {
			boosts.spa = 0;
			blockedStats.push('spa');
		  }
	  
		  if (blockedStats.length > 0) {
			this.add('-activate', this.effectState.target, 'ability: Ferocious');
			this.add('-fail', target, `${target.name}'s stats couldn't be raised due to Ferocious!`);
		  }
		},
		name: "Ferocious",
		shortDesc: "Opposing Pokémon can't raise their Attack or Sp. Atk while this Pokémon is active.",
		rating: 3,
		num: 290,
	},
	fieryspirit: {
		onModifyCritRatio(critRatio, source, target) {
			if (target && ['brn'].includes(target.status)) return 5;
		},
		flags: {},
		name: "Fiery Spirit",
		rating: 1.5,
		num: 196,
		shortDesc: "This Pokemon's attacks are critical hits if the target is burned.",

	},
	filthysurge: {
		onStart(source) {
			this.field.setTerrain('filthyterrain');
		},
		flags: {},
		name: "Filthy Surge",
		rating: 4,
		num: 226,
		shortDesc: "On switch-in, this Pokemon summons Filthy Terrain.",
	},
	greenthumb: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Grass') {
				if (!this.boost({spa: 1})) {
					this.add('-immune', target, '[from] ability: Green Thumb');
				}
				return null;
			}
		},
		onAnyRedirectTarget(target, source, source2, move) {
			if (move.type !== 'Grass') return;
			const redirectTarget = ['randomNormal', 'adjacentFoe'].includes(move.target) ? 'normal' : move.target;
			if (this.validTarget(this.effectState.target, source, redirectTarget)) {
				if (move.smartTarget) move.smartTarget = false;
				if (this.effectState.target !== target) {
					this.add('-activate', this.effectState.target, 'ability: Green Thumb');
				}
				return this.effectState.target;
			}
		},
		flags: {breakable: 1},
		name: "Green Thumb",
		rating: 3,
		num: 114,
		shortDesc: "This Pokemon draws Grass moves to itself to raise highest attacking stat by 1; Grass immunity.",
	},
	nurturer: {
		name: "Nurturer",
		shortDesc: "When this Pokémon switches out, it cures the status of the Pokémon that replaces it.",
	
		onSwitchOut(pokemon) {
		  // Mark that the next ally switch-in should be cured
		  (pokemon.side as any).nurturerPending = true;
		},
	
		onAllySwitchIn(pokemon) {
		  	if ((pokemon.side as any).nurturerPending) {
				if (pokemon.status) {
					this.add('-ability', pokemon.side.active[0], 'Nurturer');
					this.add('-curestatus', pokemon, pokemon.status);
					pokemon.cureStatus();
				}
				(pokemon.side as any).nurturerPending = false;
		  	}
		},
	},
	nutrientrunoff: {
		name: "Nutrient Runoff",
		shortDesc: "When a foe uses a healing move, this Pokémon steals half the amount healed.",
		onTryHeal(damage, target, source, effect) {
		  // Only trigger if the source is an opponent and this Pokémon has the ability
		  if (!source || source === target) return; // Not a healing transfer (e.g., Heal Pulse)
			const leechTarget = this.effectState.target;
			const stolen = Math.floor(damage / 2);
			if (!leechTarget.fainted && stolen > 0) {
			  this.heal(stolen, leechTarget);
			  this.add('-activate', leechTarget, 'ability: Nutrient Runoff');
			}
		  }
		},
	perplexing: {
		onDamagingHit(damage, target, source, move) {
			if (!this.checkMoveMakesContact(move, source, target)) return;

			let announced = false;
			for (const pokemon of [target, source]) {
				if (pokemon.volatiles['confusion']) continue;
				if (!announced) {
					this.add('-ability', target, 'Perplexing');
					announced = true;
				}
				pokemon.addVolatile('confusion');
			}
		},
		flags: {},
		name: "Perplexing",
		rating: 1,
		num: 253,
		shortDesc: "Making contact with this Pokemon may confuse the attacker.",
	},
	pridefulstance: {
		onBasePower(basePower, attacker, defender, move) {
		  // Loop through attacker's types and see if any are weak to defender's types
		  const attackerTypes = attacker.getTypes();
		  const defenderTypes = defender.getTypes();
	  
		  let hasTypeAdvantage = false;
	  
		  for (const dType of defenderTypes) {
			for (const aType of attackerTypes) {
			  const eff = this.dex.getEffectiveness(dType, aType);
			  if (eff > 0) {
				hasTypeAdvantage = true;
				break;
			  }
			}
			if (hasTypeAdvantage) break;
		  }
	  
		  if (hasTypeAdvantage && move.category === 'Physical') {
			this.debug("Prideful Stance activates: +50% power");
			return this.chainModify(1.5);
		  }
		},
		flags: {},
		name: "Prideful Stance",
		rating: 4,
		num: 110,
		shortDesc: "Its physical attacks have 1.5x power when battling against a Pokémon that has a type advantage.",
	},
	realitywarp: {
		onEffectiveness(typeMod, target, type, move) {
			if (!target) return;
			if (this.effectState.resisted) return 1; 
			if (this.effectState.superEffective) return -1; 
			if (move.category === 'Status') return;
			if (!target.runImmunity(move.type)) return;

			this.add('-activate', target, 'ability: Inverse');
		},
		name: "Reality Warp",
		rating: 2,
		num: 28,
		shortDesc: "Inverts type matchups of incoming attacks.",
	},
	snowplow: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, pokemon) {
			if (['hail', 'sleet'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(1.5);
			}
		},
		onWeather(target, source, effect) {
			if (target.hasItem('utilityumbrella')) return;
			if (effect.id === 'hail' || effect.id === 'sleet') {
				this.damage(target.baseMaxhp / 8, target, target);
			}
		},
		flags: {},
		name: "Snow Plow",
		rating: 2,
		num: 94,
		shortDesc: "If Hail is active, this Pokemon's Attack is 1.5x; loses 1/8 max HP per turn.",
	},
	swarmingsurge: {
		onStart(source) {
			this.field.setTerrain('swarmingterrain');
		},
		flags: {},
		name: "Swarming Surge",
		rating: 4,
		num: 226,
		shortDesc: "On switch-in, this Pokemon summons Swarming Terrain.",
	},
	trafficjam: {
		onFoeSwitchIn(pokemon) {
			let activated = false;
				for (const target of pokemon.adjacentFoes()) {
					if (!activated) {
						this.add('-ability', pokemon, 'Intimidate', 'boost');
						activated = true;
					}
					if (target.volatiles['substitute']) {
						this.add('-immune', target);
					} else {
						this.boost({atk: -1}, target, pokemon, null, true);
					}
				}
			},
			/*if (pokemon.activeMoveActions === 0) {
				this.boost({spe: -1}, pokemon);
			}
		}, just in case onfoeswitchin doesnt work like i think it will*/
		flags: {},
		name: "Traffic Jam",
		rating: 2,
		num: 130,
		shortDesc: "While the Pokémon active, other Pokémon have their Speed stat lowered on switch-in.",
	},
	//Perseida
	collector: {
		name: "Collector",
		rating: 0,
		num: 50,
		shortDesc: "No competitive use.",
	},
	courtship: {
		onAfterMove(source, target, move) {
			if (this.effectState.additionalAttack || !(move.flags['dance'])) { return; }
			this.effectState.additionalAttack = true;
			this.actions.runAdditionalMove(
				Dex.moves.get("attract"),
				source,
				target,
			);
			this.effectState.additionalAttack = false;
		},
		name: "Courtship",
		rating: 3,
		shortDesc: "This Pokemon uses Attract after using a dance move.",
	},
	honeyshield: {
		onSourceModifyDamage(damage, source, target, move) {
			if (target.getMoveHitData(move).typeMod > 0) {
				this.debug('Honey Shield neutralize');
				return this.chainModify(0.75);
			}
		},
		flags: {breakable: 1},
		name: "Honey Shield",
		rating: 3,
		num: 111,
		shortDesc: "This Pokemon receives 3/4 damage from supereffective attacks.",
	},
	juggler: {
		onBasePowerPriority: 19,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['bullet'] || move.flags['pulse']) {
				this.debug('Juggler boost');
				return this.chainModify(1.5);
			}
		},
		name: "Juggler",
		rating: 0,
		num: 1004,
		shortDesc: "This Pokemon's pulse and ballistic attacks have 1.5x power.",
	},
	lunartide: {
		onModifySpe(spe, pokemon) {
			if (this.field.isWeather('newmoon') || ('eclispe')) {
				return this.chainModify(2);
			}
		},
		name: "Lunar Tide",
		rating: 2,
		num: 293,
		shortDesc: "If Darkness is active, this Pokemon's Speed is doubled.",
	},
	nocturnal: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, pokemon) {
			if (['newmoon', 'eclipse'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(1.3);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(spa, pokemon) {
			if (['newmoon', 'eclipse'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(1.3);
			}
		},
		name: "Absolution",
		rating: 2,
		num: 94,
		shortDesc: "This Pokemon's Atk and Sp. Atk is 1.3x in Darkness.",
	},
	stonelethargy: {
		onModifyDefPriority: 5,
		onModifyDef(def, pokemon) {
			if (pokemon.status === 'slp') {
				return this.chainModify(1.5);
			}
		},
		onModifySpDPriority: 5,
		onModifySpD(spd, pokemon) {
			if (pokemon.status === 'slp') {
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Stone Lethargy",
		rating: 3.5,
		num: 62,
		shortDesc: "While this Pokemon is asleep, its defenses are multiplied by 1.5.",
	},
	sacredmantle: {
		onModifySecondaries(secondaries) {
			this.debug('Sacred Mantle prevent secondary');
			return secondaries.filter(effect => !!effect.self);
		},
		flags: {breakable: 1},
		name: "Sacred Mantle",
		rating: 2,
		num: 19,
		shortDesc: "This Pokemon is not affected by the secondary effect of another Pokemon's attack.",
	},
	searingpoison: {
	// The Burn part of this mechanic is implemented in move that inflict poison under `onModifyMove` in moves.ts NEED TO ADD
		flags: {},
		name: "Searing Poison",
		rating: 2.5,
		num: 151,
		shortDesc: "This Pokemon's attacks that inflict poison burn instead",
	},
	//SLLD
	bloodthirst: {
		onAfterMoveSecondarySelf(pokemon, target, move) {
			if (move.flags['bite']) {
				this.heal(pokemon.baseMaxhp / 8);
			}
		},
		name: "Bloodthirst",
		rating: 3,
		num: 173,
		shortDesc: "This Pokemon recovers 1/8 of its health when using a biting move.",
	},
	sandman: {
		onDamagingHit(damage, target, source, move) {
			if (move.flags['contact']) {
				if (this.randomChance(3, 10)) {
					source.trySetStatus('slp', target);
				}
			}
		},
		name: "Sandman",
		rating: 2,
		num: 285,
		shortDesc: "30% chance a Pokemon making contact with this Pokemon will be put to sleep.",
	},
	bouncy: {
		onDamagingHit(damage, target, source, move) {
			if (move.category === 'Physical') {
				source.hp = source.hp - damage / 3
				this.add('-damage', target, '[from] ability: Bouncy');
			}
		},
		name: "Bouncy",
		rating: 1,
		num: 133,
	},
	flameeater: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Fire') {
				if (!this.heal(target.baseMaxhp / 4)) {
					this.add('-immune', target, '[from] ability: Flame Eater');
				}
				return null;
			}
		},
		flags: {breakable: 1},
		name: "Flame Eater",
		rating: 3.5,
		num: 11,
		shortDesc: "This Pokemon heals 1/4 of its max HP when hit by Fire moves; Fire immunity.",
	},
	scarecrow: {
		onTryHitPriority: 1,
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Flying') {
					this.add('-immune', target, '[from] ability: Scarecrow');
				}
				return null;
		},
		name: "Scarecrow",
		rating: 3,
		num: 287,
		shortDesc: "This Pokemon is immune to Flying-type attacks.",
	},
	refractive: {
		onDamagingHitOrder: 1,
		onDamagingHit(damage, target, source, move) {
			if (!move.flags['contact'] && move.category !== 'Status') {
				this.damage(source.baseMaxhp / 8, source, target);
			}
		},
		name: "Refractive",
		rating: 2.5,
		num: 24,
		//Description in text file
	},
	solardiffuse: {
		onStart(source) {
			this.field.setTerrain('shiningterrain');
		},
		name: "Solar Diffuse",
		rating: 4,
		num: 226,
		shortDesc: "On switch-in, this Pokemon summons Shining Terrain.",
	},
	lunardiffuse: {
		onStart(source) {
			this.field.setTerrain('midnightterrain');
		},
		name: "Lunar Diffuse",
		rating: 4,
		num: 226,
		shortDesc: "On switch-in, this Pokemon summons Midnight Terrain.",
	},
	//Tectonic
	aboveitall: {
		onDamagingHit(damage, target, source, move) {
			if (!(target.hp > 0)) 
				{ return; }
			const counterMove = Dex.moves.get("partingshot");
			this.add("-activate", target, "Above it All");
			this.effectState.counter = true;
			this.actions.runMove(counterMove, target, target.getLocOf(source));
		},
		flags: {breakable: 1},
		name: "Above it All",
		rating: 3,
		num: 400,
		gen: 8,
		shortDesc: "This Pokemon uses Parting Shot when damaged by an attack",
	},
	adaptiveskin: {
		onDamagingHit(damage, target, source, move) {
			if (move.category === 'Status') return;
			if (move.category === 'Physical') {
				this.boost({def: 2});
			} else if (move.category === 'Special') {
				this.boost({spd: 2});
			}
		},
		flags: {},
		name: "Adaptive Skin",
		rating: 3,
		num: 192,
		shortDesc: "This Pokemon's Def/Sp. Def is raised 2 stages based on the category of move it's hit with.",
	},
	aeroshell: {
		onAfterMoveSecondarySelf(pokemon, target, move) {
			if (move.flags['wind'])  { 
				this.boost({def: 1, spd: 1});
			}
		},
		name: "Aero Shell",
		rating: 3,
		num: 281,
		shortDesc: "This Pokemon's defensive stats are boosted 1 stage after using a wind move.",
	},
	afterimage: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender) {
			if (!defender.activeTurns) {
				this.debug('After Image boost');
				return this.chainModify(1.5);
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender) {
			if (!defender.activeTurns) {
				this.debug('After Image boost');
				return this.chainModify(1.5);
			}
		},
		//Spikes and TSpikes immunity hardcoded in moves.ts
		flags: {},
		name: "After Image",
		rating: 4.5,
		num: 198,
		shortDesc: "This Pokemon's offensive stat is 1.5x against a target that switched in this turn. Avoids Spike hazards on switch-in.",
	},
	aggravate: {
		onBasePowerPriority: 19,
		onBasePower(basePower, attacker, defender, move) {
			if (move.id === 'eruption' || move.id === 'waterspout') {
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Aggravate",
		rating: 2,
		num: 138,
		shortDesc: "This Pokemons attacks based on HP amount have 1.5x power.",
	},
	anarchic: {
		onModifySpe(spe, pokemon) {
			if (this.field.isWeather('eclipse')) {
				return this.chainModify(2);
			}
		},
		flags: {},
		name: "Anarchic",
		rating: 3,
		num: 146,
		shortDesc: "If an Eclipse is active, this Pokemon's Speed is doubled.",
	},
	ancestraldance: {
		onAnyTryMove(target, source, move) {
			if ((move.flags['dance'])) {
				this.boost({def: 1, spd: 1}, source);
			}
		},
		flags: {breakable: 1},
		name: "Ancestral Dance",
		rating: 0.5,
		num: 6,
		shortDesc: "While this Pokemon is active, dance moves used by any Pokemon hbost this Pokemon's defenses 1 stage.",
	},
	apprehensive: {
		onSourceModifyDamage(damage, source, target, move) {
			if (['eclipse'].includes(source.effectiveWeather())) {
				this.debug('Apprehensive neutralize');
				return this.chainModify(0.70);
			}
		},
		flags: {},
		name: "Apprehensive",
		rating: 2,
		num: 94,
		shortDesc: "If Eclipse is active, this Pokemon receives 30% less damage from attacks.",
	},
	apricornarmor: {
		onSourceModifyDamage(damage, source, target, move) {
			if (source.status || source.hasAbility('comatose')) {
				this.debug('Apricorn Armor neutralize');
				return this.chainModify(0.50);
			}
		},
		flags: {breakable: 1},
		name: "Apricorn Armor",
		rating: 3,
		num: 111,
		shortDesc: "This Pokemon receives 1/2 damage from statused foe's attacks.",
	},
	arcane: {
		onModifySpAPriority: 5,
		onModifySpA(SpA) {
			return this.chainModify(1.3);
		},
		name: "Arcane",
		rating: 5,
		num: 37,
		shortDesc: "This Pokemon's Special Attack is 1.3x.",
	},
	arcconductor: {
		onDamagingHitOrder: 1,
		onDamagingHit(damage, target, source, move) {
			if (this.field.isWeather(['raindance', 'primordialsea'])) {
				this.damage(source.baseMaxhp / 6, source, target);
			}
		},
		flags: {},
		name: "Arc Conductor",
		rating: 2.5,
		num: 160,
		shortDesc: "This Pokemon inflicts 1/6th max HP damage to the foe when damaged during rain.",
	},
	arcticariette: {
		onModifyType(move, pokemon) {
			if (move.flags['sound']) {
				move.type = 'Ice';
			}
		},
		onBasePowerPriority: 7,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['sound']) {
				this.debug('Arctic Ariette boost');
				return this.chainModify(1.3);
			}
		},
		name: "Arctic Ariette",
		rating: 3,
		num: 283,
		shortDesc: "This Pokemon's Sound-based moves become Ice-type and are boosted 1.3x.",
	},
	assualtspines: {
		onModifySpDPriority: 5,
		onModifySpD(spd) {
			return this.chainModify(2);
		},
		onDisableMove(pokemon) {
			for (const moveSlot of pokemon.moveSlots) {
				const move = this.dex.moves.get(moveSlot.id);
				if (move.category === 'Status' && move.id !== 'mefirst') {
					pokemon.disableMove(moveSlot.id);
				}
			}
		},
		flags: {},
		name: "Assault Spines",
		rating: 5,
		num: 37,
		shortDesc: "This Pokemon's Sp. Def is doubled, but can't use Status moves.",
	},
	badinfluence: {
		onFoeTryMove(target, source, move) {
			const influenceHolder = this.effectState.target;
			if ((source.isAlly(influenceHolder) || move.target === 'all') && move.flags['heal']) {
				this.attrLastMove('[still]');
				this.add('cant', influenceHolder, 'ability: Bad Influence', move, '[of] ' + target);
				return false;
			}
		},
		flags: {breakable: 1},
		name: "Bad Influence",
		rating: 2.5,
		num: 219,
		//Description in text file
	},
	barriermaker: {
		onStart(source) {
			// duration handled in data/moves.js:tailind
			const screen = source.side.sideConditions["reflect"];
			if (!screen) {
				this.add("-activate", source, "ability: Barrier Maker");
				source.side.addSideCondition(
					"reflect",
					source,
					source.getAbility()
				);
			}
		},
		name: "Barrier Maker",
		rating: 5,
		num: 363,
		shortDesc:"On switch-in, this Pokemon summons Reflect,"
	},
	battlehardened: {
		onDamage(damage, target, source, effect) {
			if (
				effect.effectType === "Move" &&
				!effect.multihit &&
				(!effect.negateSecondary && !(effect.hasSheerForce && source.hasAbility('sheerforce')))
			) {
				this.effectState.checkedBerserk = false;
			} else {
				this.effectState.checkedBerserk = true;
			}
		},
		onTryEatItem(item) {
			const healingItems = [
				'aguavberry', 'enigmaberry', 'figyberry', 'iapapaberry', 'magoberry', 'sitrusberry', 'wikiberry', 'oranberry', 'berryjuice',
			];
			if (healingItems.includes(item.id)) {
				return this.effectState.checkedBerserk;
			}
			return true;
		},
		onAfterMoveSecondary(target, source, move) {
			this.effectState.checkedBerserk = true;
			if (!source || source === target || !target.hp || !move.totalDamage) return;
			const lastAttackedBy = target.getLastAttackedBy();
			if (!lastAttackedBy) return;
			const damage = move.multihit && !move.smartTarget ? move.totalDamage : lastAttackedBy.damage;
			if (target.hp <= target.maxhp / 2 && target.hp + damage > target.maxhp / 2) {
				this.boost({def: 3, spd: 3}, target, target);
			}
		},
		flags: {},
		name: "Battle Hardened",
		rating: 2,
		num: 201,
		shortDesc: "This Pokemon's defenses are raised by 3 stages when it reaches 1/2 or less of its max HP.",
	},
	beguiling: {
		onDamagingHit(damage, target, source, move) {
			if (move.category === 'Special') {
				if (this.randomChance(3, 10)) {
					source.addVolatile('attract', target);
				}
			}
		},
		name: "Beguiling",
		rating: 1.5,
		num: 38,
		shortDesc: "30% chance the foe will be infatuated when using a Sp. Attack against this Pokemon.",
	},
	belligerant: {
		onAfterEachBoost(boost, target, source, effect) {
			if (!source || target.isAlly(source)) {
				return;
			}
			let statsLowered = false;
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! < 0) {
					statsLowered = true;
				}
			}
			if (statsLowered) {
				this.boost({atk: 3, spa: 3}, target, target, null, false, true);
			}
		},
		flags: {},
		name: "Belligerant",
		rating: 3,
		num: 128,
		shortDesc: "This Pokemon's attacking stats are raised by 3 for each of its stats that is lowered by a foe.",
	},
	bellower: {
		onAfterMoveSecondarySelf(pokemon, target, move) {
			if (move.flags['sound'])  { 
				this.actions.useMove('torment', pokemon);
			}
		},
		name: "Bellower",
		rating: 3,
		num: 281,
		shortDesc: "This Pokemon uses Torment after using sound based move.",
	},
	servedcold: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk, pokemon) {
			if (pokemon.hp <= pokemon.maxhp / 2) {
				return this.chainModify(1.2);
			} else if (['hail', 'snow'].includes(pokemon.effectiveWeather())) {
				return this.chainModify(1.4);
			}
		},
		flags: {},
		name: "Served Cold",
		rating: 2,
		num: 94,
		shortDesc: "If Hail is active, Atk is 1.4x; If HP falls below 1/2, Atk is 1.4x.",
	},
	mentaldamage: {
		onDamagingHit(damage, target, source, move) {
			if (source.volatiles['disable']) return;
				source.addVolatile('disable', this.effectState.target);
		},
		flags: {},
		name: "Mental Damage",
		rating: 2,
		num: 130,
		shortDesc: "If this Pokemon is hit by an attack, that move gets disabled.",
	},
	teslacoils: {
		onSwitchIn(pokemon) {
			const nextMove = Dex.moves.get("charge");
			if (pokemon.activeMoveActions === 0) {
			this.actions.runMove(nextMove, pokemon, 0);
			}
		},
		flags: {},
		name: "Tesla Coils",
		rating: 2,
		num: 130,
		shortDesc: "Charges up on entry.",
	},
	envy: {
		onModifyPriority(priority, pokemon, target, move) {
			const positiveBoosts: Partial<BoostsTable> = {};
			if (Object.keys(positiveBoosts).length < 1) return;
				return priority + 1;
		},
		name: "Envy",
		rating: 2,
		num: 271,
		shortDesc: "If the foe has stat boosts, this Pokemon has +1 Priority.",
	},
	petrifying: {
		onDamagingHit(damage, target, source, move) {
			if (move.category === 'Special') {
				if (this.randomChance(3, 10)) {
					source.trySetStatus('par', target);
				}
			}
		},
		flags: {},
		name: "Petrifying",
		rating: 2,
		num: 9,
		shortDesc: "30% chance a Pokemon using a special move against this Pokemon will be paralyzed.",
	},
	rockbody: {
		onWeather(target, source, effect) {
			if (effect.id === 'sandstorm') {
				this.heal(target.baseMaxhp / 8);
			}
		},
		onImmunity(type, pokemon) {
			if (type === 'sandstorm') return false;
		},
		flags: {},
		name: "Rock Body",
		rating: 1,
		num: 115,
		shortDesc: "If Sandstorm is active, this Pokemon heals 1/8 of its max HP each turn; Sandstorm Immunity",
	},
	gild: {
		name: "Gild",
		rating: 0,
		num: 50,
		shortDesc: "No competitive use.",
	},
	refreshments: { //need to add healing lower between itself and ally in doubles. dont really care atm
		onStart(pokemon) {
			if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
				this.heal(pokemon.baseMaxhp / 2);
			}
		},
		flags: {},
		name: "Refreshments",
		rating: 2,
		num: 22,
		shortDesc: "Upon entry during sunshine, heals the lowest HP ally or self by 50%."
	},
	chillout: {
		onSourceDamagingHit(damage, target, source, move) {
			// Despite not being a secondary, Shield Dust / Covert Cloak block Poison Touch's effect
			if (target.hasAbility('shielddust') || target.hasItem('covertcloak')) return;
			if (move.category === 'Special') {
				if (this.randomChance(3, 10)) {
					target.trySetStatus('fbt', source);
				}
			}
		},
		flags: {},
		name: "Chillout",
		rating: 2,
		num: 143,
		shortDesc: "This Pokemon's Special moves have a 30% chance of inflicting frostbite.",
	},
	suddenchill: {
		onDamagingHit(damage, target, source, move) {
			if (move.category === 'Special') {
				if (this.randomChance(3, 10)) {
					source.trySetStatus('fbt', target);
				}
			}
		},
		flags: {},
		name: "Sudden Chill",
		rating: 2,
		num: 49,
		shortDesc: "30% chance a Pokemon using Special attacks against this Pokemon will be inflicted with frostbite.",
	},
	schadenfreude: {
		onSourceAfterFaint(length, target, source, effect) {
				this.add("-activate", source, "Predator");
				source.heal(source.baseMaxhp / 4);
				this.add("-heal", source, source.getHealth, "[silent]");
		},
		name: "Schadenfreude",
		rating: 3,
		num: 378,
		gen: 9,
		shortDesc: "The user restores 1/4 of its maximum HP if another Pokemon is KOed",
	},
	followthrough: {
		onSourceAfterFaint(length, target, source, effect) {
			if (effect && effect.effectType === 'Move') {
				this.boost({spe: 2}, source);
			}
		},
		flags: {},
		name: "Follow Through",
		rating: 3,
		num: 153,
		shortDesc: "This Pokemon's Speed is raised by 2 stages if it attacks and KOes another Pokemon.",
	},
	timeinterloper: {
		onBasePowerPriority: 7,
		onBasePower(basePower, attacker, defender, move) {
			if (move.category !== 'Status') {
				this.debug('Time Interloper Boost');
				return this.chainModify(0.75);
			}
		},
		onModifyMove(move, pokemon, target) {
			if (move.category === 'Physical') {
				this.debug('Time Interloper Change');
				move.category = 'Special';
			}
		},
		onModifyPriority(priority, pokemon, target, move) {
			if (move?.category !== 'Status') {
				return priority + 1;
			}
		},
		name: "Time Interloper",
		rating: 1.5,
		num: 296,
		shortDesc: "User's attacking moves have priority, deal 25% less damage and become special.",
	},
	sentry: {
		onStart(pokemon) {
			pokemon.addVolatile('sentry');
		},
    	condition: {
			onPrepareHit(source, target, move) {
				if (move.category !== 'Status') {
					source.volatiles['sentry'].lostFocus = true;
         			this.debug('Sentry lost focus');
				}
			},
   		},
		   onSourceModifyDamage(damage, source, target, move) {
			if (source.volatiles['sentry'] && !source.volatiles['sentry'].lostFocus) {
				return this.chainModify(0.75);
      		}
			  source.volatiles['sentry'].lostFocus = false;
    	},
		name: "Sentry",
		rating: 3,
		num: -103,
		shortDesc: "This Pokemon receives 3/4 damage if it used a status move.",
	},
	winterinsulation: {
		onTryHitPriority: 1,
		onTryHit(target, source, move) {
			if (['hail', 'snow'].includes(source.effectiveWeather())) {
				if (move.type === 'Fire' || move.type === 'Electric') {
					this.add('-immune', target, '[from] ability: Winter Insulation');
					return null;
		 		}
			}
		},
		name: "Winter Insulation",
		rating: 2,
		num: 287,
		shortDesc: "If Hail is active, this Pokemon is immune to Fire and Electric-type attacks.",
	},
	irrefutable: {
		onAfterMoveSecondarySelf(pokemon, target, move) {
			if (target && target.runEffectiveness(move) < 0) {
				this.boost({atk: 2}, pokemon);
			}
		},
		name: "Irrefutable",
		rating: 3,
		gen: 8,
		shortDesc: "This Pokemon's Atk is raised by 2 stages if it uses a Not-Very-Effective move.",
	},
	unafraid: {
		onSourceModifyAtkPriority: 6,
		onSourceModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Dark' || move.type === 'Bug') {
				this.debug('Unafraid weaken');
				return this.chainModify(0.5);
			}
		},
		onSourceModifySpAPriority: 5,
		onSourceModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Dark' || move.type === 'Bug') {
				this.debug('Unafraid weaken');
				return this.chainModify(0.5);
			}
		},
		flags: {breakable: 1},
		name: "Unafraid",
		rating: 3.5,
		num: 47,
		shortDesc: "Dark-/Bug-type moves against this Pokemon deal damage with a halved offensive stat.",
	},
	petty: {
		onFoeAfterBoost(boost, target, source, effect) {
			if (effect?.name === 'Petty' || effect?.name === 'Mirror Herb') return;
			const pokemon = this.effectState.target;
			const positiveBoosts: Partial<BoostsTable> = {};
			let i: BoostID;
			for (i in boost) {
				if (boost[i]! > 0) {
					positiveBoosts[i] = boost[i];
				}
			}
			if (Object.keys(positiveBoosts).length < 1) return;
			this.boost(positiveBoosts, pokemon);
		},
		flags: {},
		name: "Petty",
		rating: 3,
		num: 290,
		shortDesc: "When an opposing Pokemon has a stat stage raised, this Pokemon copies the effect.",
	},
	archvillian: {
		onModifyAtkPriority: 5,
		onModifyAtk(atk) {
			return this.chainModify(1.5);
		},
		onDamage(damage, target, source, effect) {
			if (damage >= target.hp) return target.hp - 1;
		},
		flags: {},
		name: "Archvillian",
		rating: 2,
		num: 37,
		shortDesc: "This Pokemon's Attack is 1.5x but it cannot KO the target.",
	},
	pestilent: {
		onAfterMoveSecondarySelf(pokemon, target, move) {
			if (pokemon.hp <= pokemon.maxhp / 2) {
				this.actions.useMove('leechseed', pokemon);
			}
		},
		flags: {},
		name: "Pestilent",
		rating: 1.5,
		num: 123,
		shortDesc: "This Pokemon uses Leech Seed after attacking if it has 1/2 or less of its max HP.",
	},
	sealingbody: {
		onDamagingHit(damage, target, source, move) {
			if (source.volatiles['disable']) return;
			if (!move.isMax && !move.flags['futuremove'] && move.id !== 'struggle') {
					source.addVolatile('disable', this.effectState.target);
			}
		},
		flags: {},
		name: "Sealing Body",
		rating: 3,
		num: 130,
		shortDesc: "If this Pokemon is hit by an attack, that move gets disabled.",
	},
	toilandtrouble: {
		onStart(pokemon) {
			if (this.suppressingAbility(pokemon)) return;
			this.add('-ability', pokemon, 'Toil and Trouble');
		},
		onAnyModifySpA(spa, target, source, move) {
			const abilityHolder = this.effectState.target;
			if (target.hasAbility('Toil and Trouble')) return;
			if (target.status !== 'fbt' ) return;
			if (!move.ruinedSpA?.hasAbility('Toil and Trouble')) move.ruinedSpA = abilityHolder;
			if (move.ruinedSpA !== abilityHolder) return;
			this.debug('Toil and Trouble SpA drop');
			return this.chainModify(0.50);
		},
		onAnyModifyAtk(atk, target, source, move) {
			const abilityHolder = this.effectState.target;
			if (target.hasAbility('Toil and Trouble')) return;
			if (target.status !== 'brn' ) return;
			if (!move.ruinedAtk?.hasAbility('Toil and Trouble')) move.ruinedAtk = abilityHolder;
			if (move.ruinedAtk !== abilityHolder) return;
			this.debug('Toil and Trouble Atk drop');
			return this.chainModify(0.50);
		},
		flags: {},
		name: "Toil and Trouble",
		rating: 2,
		num: 284,
		shortDesc: "Active Pokemon that are burned or frostbitten have their offensive stat multiplied by 0.5.",
	},
	slumberingdrake: {
		onStart(pokemon) {
			pokemon.trySetStatus('slp', pokemon);
			this.boost({atk: 2, def: 2, spa: 2, spd: 2, spe: 2}, pokemon);

		},
		flags: {},
		name: "Slumbering Drake",
		rating: 3,
		num: 22,
		shortDesc: "On switch-in, this Pokemon falls asleep then it's stats are raised by 2 stages.",
	},
	fatigued: {
		onAfterMoveSecondarySelf(pokemon, target, move) {
			this.actions.useMove('rest', pokemon);
		},
		name: "Fatigued",
		rating: 3,
		num: 281,
		shortDesc: "This Pokemon uses rest after using an attack.",
	},
	ruinous: { //test please
		onAnyModifyDamage(damage, source, target, move) {
			return this.chainModify(1.4);
		},
		name: "Ruinous",
		rating: 2.5,
		num: 999,
		shortDesc: "All Pokémon deal 40% more move damage.",
	},
	swordplay: {
		onBasePowerPriority: 19,
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['slicing']) {
				this.debug('Swordplay boost');
				return this.chainModify(1.3);
			}
		},
		flags: {},
		name: "Swordplay",
		rating: 3,
		num: 292,
		shortDesc: "This Pokemon's slicing moves have their power multiplied by 1.3.",
	},
};
