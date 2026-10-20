## Default Permission

Default permissions for the AdMob plugin — exposes init plus the rewarded-interstitial show command, and the framework-provided event-listener commands needed for `addPluginListener` to subscribe to rewarded-state.

#### This default permission set includes the following:

- `allow-init`
- `allow-show-rewarded`
- `allow-registerListener`
- `allow-removeListener`

## Permission Table

<table>
<tr>
<th>Identifier</th>
<th>Description</th>
</tr>


<tr>
<td>

`admob:allow-init`

</td>
<td>

Enables the init command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`admob:deny-init`

</td>
<td>

Denies the init command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`admob:allow-show-rewarded`

</td>
<td>

Enables the show_rewarded command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`admob:deny-show-rewarded`

</td>
<td>

Denies the show_rewarded command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`admob:allow-registerListener`

</td>
<td>

Allows the webview to register event listeners for plugin-emitted events (rewarded-state).

</td>
</tr>

<tr>
<td>

`admob:deny-registerListener`

</td>
<td>

Denies the webview from registering event listeners.

</td>
</tr>

<tr>
<td>

`admob:allow-removeListener`

</td>
<td>

Allows the webview to remove previously-registered event listeners.

</td>
</tr>

<tr>
<td>

`admob:deny-removeListener`

</td>
<td>

Denies the webview from removing event listeners.

</td>
</tr>
</table>
