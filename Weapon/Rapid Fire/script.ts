import * as modlib from '../../SDK/modlib'; // for local testing

// import * as modlib from 'modlib'; // required on server side
const SPAWN_POINTS = 2;
const SPAWNER = 100;

// This will trigger at the start of the gamemode.
export function OnGameModeStarted(): void
{
    RapidFire.GameData.OnGameModeStarted();
}

// This will trigger when the gamemode ends.
export function OnGameModeEnding(): void
{
    RapidFire.GameData.OnGameModeEnded();
}

// This will trigger when a Player joins the game.
export function OnPlayerJoinGame(eventPlayer: mod.Player): void
{
    RapidFire.GameData.OnPlayerJoined(eventPlayer);
}

// This will trigger whenever a Player deploys.
export function OnPlayerDeployed(eventPlayer: mod.Player): void
{
    RapidFire.GameData.OnPlayerDeployed(eventPlayer);
}

// This will trigger when the Player dies and returns to the deploy screen.
export function OnPlayerUndeploy(eventPlayer: mod.Player): void
{
    RapidFire.GameData.OnPlayerUndeploy(eventPlayer);
}

// This will trigger when an AISpawner spawns an AI Soldier.
export function OnSpawnerSpawned(eventPlayer: mod.Player, eventSpawner: mod.Spawner): void
{
    RapidFire.GameData.OnSpawnBot(eventPlayer, eventSpawner);
}

// This will trigger when a Player earns a kill against another Player.
export function OnPlayerEarnedKill( eventPlayer: mod.Player, eventOtherPlayer: mod.Player, eventDeathType: mod.DeathType, eventWeaponUnlock: mod.WeaponUnlock ): void
{
    /* need to track total kills
        300 kills = challenge 1
        400 kills = challenge 2
        300 kills = challenge 3

        1000 total kills
    */
    RapidFire.GameData.OnPlayerEarnedKill(eventPlayer, eventOtherPlayer, eventDeathType, eventWeaponUnlock);
}

// This will trigger when a Player takes damage.
export function OnPlayerDamaged( eventPlayer: mod.Player, eventOtherPlayer: mod.Player, eventDamageType: mod.DamageType, eventWeaponUnlock: mod.WeaponUnlock ): void
{
    /* need to track total damage output 
        10,000 damage = challenge 1
        4,000 damage = challenge 3

        14,000 total damage
    */

    RapidFire.GameData.OnPlayerDamaged(eventPlayer, eventOtherPlayer, eventDamageType, eventWeaponUnlock);
}

// This will trigger whenever a Player dies.
export function OnPlayerDied( eventPlayer: mod.Player, eventOtherPlayer: mod.Player, eventDeathType: mod.DeathType, eventWeaponUnlock: mod.WeaponUnlock ): void
{
    RapidFire.GameData.OnPlayerDied(eventPlayer);
}

// 
export function OngoingGlobal(): void
{
    RapidFire.GameData.OngoingGlobal();
}


export namespace RapidFire
{
    export enum SoldierTeam {
        PLAYERS = 1, 
        BOTS = 2
    }

    export enum GameState {
        GameInit,
        GameActive,
        GameEnd
    }

    export class SoldierTM
    {
        location!: mod.Vector;
        rotation!: mod.Vector;
        lookAt!: mod.Vector;
        velocity!: number;
        private player: mod.Player;

        constructor(player: mod.Player)
        {
            this.player = player;
            this.update();
        }

        update(): void
        {
            this.location = mod.GetSoldierState(this.player, mod.SoldierStateVector.GetPosition);
            this.lookAt = mod.GetSoldierState(this.player, mod.SoldierStateVector.GetFacingDirection);
            this.velocity = mod.GetSoldierState(this.player, mod.SoldierStateNumber.Speed);
            this.rotation = mod.GetObjectRotation(this.player);
        }
    }

    export class GameData
    {
        static state: GameState = GameState.GameInit;
        static host: mod.Player | undefined; // host is the player who started the game , the server is dedicated and can persist without after the host leaves the session. therefore the host is index 0 in the player array
        static hostID: number = -1;
        static gameTime: number = 0; // total accumulated game time in seconds
        static clients: number = 0; // current number of players / bots connected
        static bots: number = 0; // current number of clients that are bots
        static botSpawners: mod.Spawner[] = []; // list of bot spawners in the map
        static objDamageDealt: number = 0; // total damage dealt by the host player
        static objKills: number = 0; // total kills by the host player
        
        private constructor() {
            // Private constructor prevents instances
        }

        static initialize(host: mod.Player): void
        {
            GameData.state = GameState.GameInit;
            GameData.clients = 1; // Start with the host
            GameData.host = host;
            GameData.hostID = mod.GetObjId(host);
            GameData.botSpawners = [mod.GetSpawner(SPAWNER), mod.GetSpawner(SPAWNER + 1)]; // get bot spawners for each team
            console.log(`GameData initialized. HostID: ${GameData.hostID} | Name: ${host}`);
        }

        static reset(): void
        {
            GameData.state = GameState.GameInit;
            GameData.host = undefined;
            GameData.hostID = -1;
            GameData.gameTime = 0;
            GameData.clients = 0;
            GameData.bots = 0;
            console.log("GameData reset");
        }

        static async update(): Promise<void>
        {
            GameData.gameTime++;

            switch (GameData.state) {
                case GameState.GameInit:    break;
                case GameState.GameActive:  break;
                case GameState.GameEnd:     break;
            }

            await mod.Wait(1); // wait 1 second before next update
        }

        static OngoingGlobal(): void
        {
            const localSoldier = PlayerSoldier.get(PlayerSoldier.soldierObjects[GameData.hostID], undefined);
            if (!localSoldier)
                return;

            localSoldier.updateSoldier();

            const aiPos = mod.Add(localSoldier.soldierTM.location, mod.Multiply(localSoldier.soldierTM.lookAt, 10));

            for (let obj of PlayerSoldier.soldierObjects)
            {
                let soldier = PlayerSoldier.get(obj, undefined);
                if (!soldier || soldier.playerID == localSoldier.playerID)
                    continue;

                mod.AIMoveToBehavior(soldier.player, aiPos);
            }

            // Update score widget UI
            UI.RoundInfoWidget.update();
        }

        static async OnGameModeStarted(): Promise<void>
        {
            console.log("CZGame OnGameModeStarted");

            mod.PauseGameModeTime(true); // match runs indefinitely until manually ended

            /* Initialize UI widgets */
            UI.RoundInfoWidget.init();

            for ( let spawner of GameData.botSpawners )
                mod.AISetUnspawnOnDead(spawner, true); 
            
            for (let i = 0; i < SPAWN_POINTS; i++)
                GameData.SpawnAI(SoldierTeam.BOTS);

            // Initialize the game when first player joins (will be handled in OnPlayerJoined)
            while (GameData.state != GameState.GameEnd)
            {
                await GameData.update();
            }
        }

        static OnGameModeEnded(): void
        {
            PlayerSoldier.soldierObjects = [];
            GameData.reset();
        }

        static OnPlayerJoined(eventPlayer: mod.Player): void
        {
            let soldier = PlayerSoldier.get(eventPlayer, undefined);
            if (!soldier)
                return;

            // Initialize game with first player as host
            if (GameData.clients === 0 && !GameData.host) {
                GameData.initialize(eventPlayer);
            } else {
                GameData.clients++;
            }

            GameData.bots += soldier.isAI ? 1 : 0;

            console.log(`Player Joined: ID ${soldier.playerID} | TeamID: ${soldier.teamID} | isAI: ${soldier.isAI} | Total clients: ${GameData.clients}`);
        }

        static OnPlayerLeft(eventNumber: number): void
        {
            let soldier = PlayerSoldier.getPlayerByID(eventNumber);
            if (soldier) {
                GameData.clients--;
                GameData.bots -= soldier.isAI ? 1 : 0;
                console.log(`Player Left: ID ${soldier.playerID} | Total clients: ${GameData.clients}`);
            }

            PlayerSoldier.destroy(eventNumber);

            if (GameData.clients <= 0)
            {
                mod.SetGameModeTimeLimit(1); // end game mode after 1 second if no players are left
                mod.PauseGameModeTime(false); // unpause the timer and let the game end itself naturally 
                console.log("No players left, ending game mode in 1 second.");
            }
        }

        static OnPlayerDeployed(eventPlayer: mod.Player): void
        {
            let soldier = PlayerSoldier.get(eventPlayer, undefined);
            if (!soldier)
                return;

            console.log(`Player Deployed: ID ${soldier.playerID} | TeamID: ${soldier.teamID} | isAI: ${soldier.isAI}`);
        }

        static OnSpawnBot(eventPlayer: mod.Player, eventSpawner: mod.Spawner): void
        {
            let soldier = PlayerSoldier.get(eventPlayer, eventSpawner);
            if (!soldier)
                return;

            GameData.bots++;
            mod.AIIdleBehavior(soldier.player); // set default AI behavior
            mod.AIEnableShooting(soldier.player, false); // disable AI shooting
            console.log(`Bot Spawned: ID ${soldier.playerID} | TeamID: ${soldier.teamID}`);
        }

        static OnPlayerUndeploy(eventPlayer: mod.Player): void
        {
            let soldier = PlayerSoldier.get(eventPlayer, undefined);
            if (!soldier)
                return;

            if (soldier.isAI)
                GameData.bots--;

            console.log(`Player Undeployed: ID ${soldier.playerID} | TeamID: ${soldier.teamID} | isAI: ${soldier.isAI}`);
        }

        static OnPlayerEarnedKill(eventPlayer: mod.Player, eventOtherPlayer: mod.Player, eventDeathType: mod.DeathType, eventWeaponUnlock: mod.WeaponUnlock): void
        {
            if (eventPlayer == eventOtherPlayer)
                return; 

            let killer = PlayerSoldier.get(eventPlayer, undefined);
            if (!killer)
                return; 

            if (killer.teamID == mod.GetObjId(mod.GetTeam(eventOtherPlayer))) // ensure team is valid
                return;

            if (killer.playerID != GameData.hostID)
                return;

            GameData.objKills++;
            console.log(`Player Earned Kill: ID ${killer.playerID} | TeamID: ${killer.teamID} | DeathType: ${eventDeathType} | TotalKills: ${GameData.objKills}`);
        }

        static OnPlayerDamaged(eventPlayer: mod.Player, eventOtherPlayer: mod.Player, eventDamageType: mod.DamageType, eventWeaponUnlock: mod.WeaponUnlock): void
        {
            let victim = PlayerSoldier.get(eventPlayer, undefined);
            if (!victim)
                return;

            let soldier = PlayerSoldier.get(eventOtherPlayer, undefined);
            if (!soldier)
                return;

            if (soldier.teamID == victim.teamID) // ensure team is valid
                return;

            if (soldier.playerID != GameData.hostID)
                return;
            
            let damageReceived = victim.OnPlayerDamaged();
            GameData.objDamageDealt += damageReceived;
            console.log(`Player Damaged: ID ${soldier.playerID} | TeamID: ${soldier.teamID} | DamageType: ${eventDamageType} | DamageDealt: ${damageReceived} | TotalDamageDealt: ${GameData.objDamageDealt}`);
        }

        static OnPlayerDied(eventPlayer: mod.Player): void
        {
            let soldier = PlayerSoldier.get(eventPlayer, undefined);
            if (!soldier)
                return;

            if (soldier.isAI && soldier.spawner)
            {
                GameData.SpawnAI(soldier.teamID);
                PlayerSoldier.destroy(soldier.playerID);
            }
        }

        static SpawnAI(teamID: number): void
        {
            if (teamID < 1 || teamID > 2)
                return;

            /* get spawner for team */
            const spawner = GameData.botSpawners[teamID - 1];

            /* get a random number between 0 - 3 for AI class */
            const aiClassIndex = Math.floor(Math.random() * 4);
            let aiClass: mod.SoldierClass;
            switch (aiClassIndex) {
                case 0: aiClass = mod.SoldierClass.Assault; break;
                case 1: aiClass = mod.SoldierClass.Engineer; break;
                case 2: aiClass = mod.SoldierClass.Support; break;
                case 3: aiClass = mod.SoldierClass.Recon; break;
                default: aiClass = mod.SoldierClass.Assault; break;
            }

            /* spawn AI from spawner with specified class and team */
            mod.SpawnAIFromAISpawner(spawner, aiClass, mod.GetTeam(teamID));
        }
    }

    export class PlayerSoldier
    {
        player: mod.Player;
        playerID: number;
        teamID: number;
        isAI: boolean;
        spawner: mod.Spawner | undefined;
        currentHealth: number = 100;
        soldierTM: SoldierTM;   

        // static list of all player instances
        static soldierObjects: mod.Player[] = [];

        // static list of all soldier players by playerID
        static #allSoldierPlayers: { [key: number]: PlayerSoldier } = {};

        /* should only be created via PlayerSoldier.get() */
        constructor(player: mod.Player, spawner?: mod.Spawner)
        {
            this.player = player;
            this.playerID = mod.GetObjId(player);
            this.teamID = mod.GetObjId(mod.GetTeam(player)); // teamID should be 1 or 2
            this.isAI = mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier);
            if (this.isAI && spawner)
                this.spawner = spawner;
            this.soldierTM = new SoldierTM(player);
            PlayerSoldier.soldierObjects.push(player);
        }

        /* should only be accessed via OnPlayer Events , a new Soldier will be created if none exists */
        static get(player: mod.Player, spawner: mod.Spawner | undefined): PlayerSoldier | undefined
        {
            let playerID = mod.GetObjId(player);
            if (playerID > -1)
            {
                let soldier = PlayerSoldier.#allSoldierPlayers[playerID];
                if (!soldier)
                {
                    soldier = new PlayerSoldier(player, spawner);
                    PlayerSoldier.#allSoldierPlayers[playerID] = soldier;
                    console.log(`Created PlayerSoldier for Player ID: ${playerID} | TeamID: ${soldier.teamID} | isAI: ${soldier.isAI}`);               
                }
                return soldier;
            }
            return undefined;
        }

        /* should only be accessed via OnPlayerLeaveGame Event */
        static destroy(playerID: number): void
        {
            //  let playerID = mod.GetObjId(player);
            if (playerID <= -1)
                return;
            console.log(`Removing PlayerSoldier for Player ID: ${playerID}`);
            // Remove from the players dictionary
            let soldier = this.#allSoldierPlayers[playerID];
            if (soldier) 
                {

                // Remove from soldierObjects array
                const index = this.soldierObjects.indexOf(soldier.player);
                if (index > -1) {
                    this.soldierObjects.splice(index, 1);
                }
            }
            
            delete this.#allSoldierPlayers[playerID];
        }

        /* get a PlayerSoldier by playerID */
        static getPlayerByID(playerID: number): PlayerSoldier | undefined
        {
            return this.#allSoldierPlayers[playerID];
        }

        OnPlayerDamaged(): number
        {
            let newHealth = mod.GetSoldierState(this.player, mod.SoldierStateNumber.CurrentHealth);
            let damageReceived = this.currentHealth - newHealth;
            this.currentHealth = newHealth; // sync current health
            return damageReceived;
        }

        updateSoldier(): void
        {
            /* update transform data */
            this.soldierTM.update();
        }
    }
}

export namespace UI
{
    export class RoundInfoWidget
    {

        // Auto-generated UI snippet (Container_MatchInfo) 10/22/2025, 9:53:06 AM
        static widget = modlib.ParseUI(
          {
            name: "Container_MatchInfo",
            type: "Container",
            position: [10, 10],
            size: [250, 150],
            anchor: mod.UIAnchor.TopLeft,
            visible: true,
            padding: 0,
            bgColor: [0.2, 0.2, 0.2],
            bgAlpha: 0.8,
            bgFill: mod.UIBgFill.Blur,
            children: [
              {
                name: "Text_Kills",
                type: "Text",
                position: [0, 0],
                size: [100, 50],
                anchor: mod.UIAnchor.TopLeft,
                visible: true,
                padding: 10,
                bgColor: [0.2, 0.2, 0.2],
                bgAlpha: 1,
                bgFill: mod.UIBgFill.None,
                textLabel: mod.stringkeys.Text_Kills,
                textColor: [0.0667, 1, 0],
                textAlpha: 1,
                textSize: 20,
                textAnchor: mod.UIAnchor.CenterLeft
                },
                {
                name: "Text_Damage",
                type: "Text",
                position: [0, 50],
                size: [100, 50],
                anchor: mod.UIAnchor.TopLeft,
                visible: true,
                padding: 10,
                bgColor: [0.2, 0.2, 0.2],
                bgAlpha: 1,
                bgFill: mod.UIBgFill.None,
                textLabel: mod.stringkeys.Text_Damage,
                textColor: [0.0667, 1, 0],
                textAlpha: 1,
                textSize: 20,
                textAnchor: mod.UIAnchor.CenterLeft
                },
                {
                name: "Container_TimeText",
                type: "Container",
                position: [0, 100],
                size: [250, 50],
                anchor: mod.UIAnchor.TopLeft,
                visible: true,
                padding: 0,
                bgColor: [0.2, 0.2, 0.2],
                bgAlpha: 0.8,
                bgFill: mod.UIBgFill.GradientTop,
                children: [
                {
                    name: "Text_ElapsedTime",
                    type: "Text",
                    position: [0, 0],
                    size: [250, 50],
                    anchor: mod.UIAnchor.TopLeft,
                    visible: true,
                    padding: 0,
                    bgColor: [0.2, 0.2, 0.2],
                    bgAlpha: 1,
                    bgFill: mod.UIBgFill.None,
                    textLabel: mod.stringkeys.Text_ElapsedTime,
                    textColor: [1, 1, 1],
                    textAlpha: 1,
                    textSize: 24,
                    textAnchor: mod.UIAnchor.Center
                    }
                ]
                },
                {
                        name: "Container_Kills",
                        type: "Container",
                        position: [100, 0],
                        size: [150, 50],
                        anchor: mod.UIAnchor.TopLeft,
                        visible: true,
                        padding: 0,
                        bgColor: [0.2, 0.2, 0.2],
                        bgAlpha: 1,
                        bgFill: mod.UIBgFill.None,
                        children: [
                          {
                            name: "Text_ContainerKills",
                            type: "Text",
                            position: [0, 0],
                            size: [150, 50],
                            anchor: mod.UIAnchor.TopLeft,
                            visible: true,
                            padding: 0,
                            bgColor: [0.2, 0.2, 0.2],
                            bgAlpha: 1,
                            bgFill: mod.UIBgFill.None,
                            textLabel: mod.stringkeys.Text_ContainerKills,
                            textColor: [1, 1, 1],
                            textAlpha: 1,
                            textSize: 24,
                            textAnchor: mod.UIAnchor.Center
                          }
                        ]
                },
                {
                        name: "Container_Damage",
                        type: "Container",
                        position: [100, 50],
                        size: [150, 50],
                        anchor: mod.UIAnchor.TopLeft,
                        visible: true,
                        padding: 0,
                        bgColor: [0.2, 0.2, 0.2],
                        bgAlpha: 1,
                        bgFill: mod.UIBgFill.None,
                        children: [
                  {
                    name: "Text_ContainerDamage",
                    type: "Text",
                    position: [0, 0],
                    size: [150, 50],
                    anchor: mod.UIAnchor.TopLeft,
                    visible: true,
                    padding: 0,
                    bgColor: [0.2, 0.2, 0.2],
                    bgAlpha: 1,
                    bgFill: mod.UIBgFill.None,
                    textLabel: mod.stringkeys.Text_ContainerDamage,
                    textColor: [1, 1, 1],
                    textAlpha: 1,
                    textSize: 24,
                    textAnchor: mod.UIAnchor.Center
                  }
                ]
              }
            ]
          }
        );

        // Store widget references for updates
        static dmgText: mod.UIWidget | undefined;    // # damage dealt
        static killsText: mod.UIWidget | undefined;  // # kills
        static timeText: mod.UIWidget | undefined;   // hh:mm:ss

        private constructor() {}

        // Initialize widget references
        static init(): void 
        {
            this.dmgText = mod.FindUIWidgetWithName("Text_ContainerDamage");
            this.killsText = mod.FindUIWidgetWithName("Text_ContainerKills");
            this.timeText = mod.FindUIWidgetWithName("Text_ElapsedTime");
        }

        // Update the score widget with current game data
        static update(): void 
        {
            // Format time remaining and status based on game state
            let showTimeWidget = true;

            /* KILLS */
            if (this.dmgText)
                mod.SetUITextLabel(this.dmgText, mod.Message("{}", RapidFire.GameData.objDamageDealt || 0));

            /* DAMAGE */
            if (this.killsText)
                mod.SetUITextLabel(this.killsText, mod.Message("{}", RapidFire.GameData.objKills || 0));

            /* ROUND TIMER */
            if (this.timeText) 
            {
                let timeLeft = RapidFire.GameData.gameTime;
                let minutes = Math.floor(timeLeft / 60);
                let seconds = timeLeft % 60;
                if (seconds < 10) {
                    mod.SetUITextLabel(this.timeText, mod.Message("{}:0{}", minutes, seconds));
                } else {
                    mod.SetUITextLabel(this.timeText, mod.Message("{}:{}", minutes, seconds));
                }
            }

            // Update widget visibility based on game state
            let shouldShow = true && showTimeWidget;
            if (this.widget) {
                mod.SetUIWidgetVisible(this.widget, shouldShow);
            }
        }

        // Show/hide the score widget
        static ShowWidget(visible: boolean): void {
            if (this.widget) {
                mod.SetUIWidgetVisible(this.widget, visible);
            }
        }
    }
}