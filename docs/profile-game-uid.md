# Game profile UID — edit & delete

Base URL: `/api/profile/game-profile`  
Auth: `Authorization: Bearer <accessToken>`  
Content-Type: `application/json`

## Edit / save UID (game pata ho)

**`PATCH /api/profile/game-profile`**

| Key | Required | Description |
|-----|----------|-------------|
| `gameId` | one of identity | e.g. `free-fire` |
| `gameName` | one of identity | e.g. `Free Fire` |
| `platform` | with `game` / `gameName` | `mobile` or `pc` |
| `game` | with `platform` | canonical game name |
| `uid` | yes* | naya UID string |

\*`uid` non-empty string = save/update. `uid: null` / `""` ya `clearUid: true` = sirf UID hatao (game row rehti hai).

**Example — edit UID**

```json
{
  "gameId": "free-fire",
  "uid": "43060799"
}
```

## Delete sirf UID (saved value se locate)

**`PATCH /api/profile/game-profile`**

Body mein **sirf** `uid` (koi `gameId` / `platform` mat bhejo):

```json
{ "uid": "43060786" }
```

Jo row par yahi UID saved hai, uska UID clear ho jayega.

## Poori game row hatao (list se game gayab)

**`DELETE /api/profile/game-profile`**

```json
{
  "gameId": "free-fire",
  "action": "removeGame"
}
```

`action` default `removeGame`. Poori followed game entry delete.

---

Pick lists (India orgs / personalities) **`GET /api/profile/game-options`** par; profile GET par nahi.
