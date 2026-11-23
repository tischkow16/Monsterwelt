import json
fs=[json.load(open(f'm{i}.json')) for i in range(1,8)]
last=fs[6]
mons=[]
for f in fs:
  for m in f['monster']:
    if not m.get('kategorie'):
      s=(m.get('seltenheit') or 'normal').lower()
      m['kategorie']={'normal':'Normal','selten':'Selten','legendär':'Legendär','mythisch':'Mythisch'}.get(s,'Normal')
    mons.append(m)
champs={}
for f in fs:
  for c in f.get('champions',[]): champs[c['id']]=c
data={'typen':last['typen'],'typTabelle':last['typTabelle'],'typenAnzeigeNamen':last.get('typenAnzeigeNamen',{}),'shinyRegeln':last.get('shinyRegeln',{}),
      'monster':mons,'champions':sorted(champs.values(), key=lambda c:int(c['id'][1:])),'kampfregeln':last.get('kampfregeln',{}),'legendShiny':last.get('legendäreShinyVarianten',[])}
js=open('game.js').read().replace('/*DATA*/null', json.dumps(data,ensure_ascii=False))
html=open('template.html').read().replace('/*GAME*/', js)
open('monsterwelt.html','w').write(html)
print(len(html), len(data['monster']), len(data['champions']))
