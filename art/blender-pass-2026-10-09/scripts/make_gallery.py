from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
BASE=Path('/Users/patabrava/Documents/AI/github/Camilo/Ines/art/blender-pass-2026-10-09')
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',28)
small=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',20)
assets=[('dog_nala_puppy','Nala — puppy'),('dog_nala_growing','Nala — growing'),('dog_bruno_puppy','Bruno'),('human_mira','Mira'),('human_alex','Alex')]
def sheet(items,name):
 width=1440; row=665
 canvas=Image.new('RGB',(width,row*len(items)), '#f3f0e9');d=ImageDraw.Draw(canvas)
 for index,(asset,title) in enumerate(items):
  top=index*row
  d.text((24,top+12),title,font=font,fill='#263b32')
  for col,variant in enumerate(['before','after']):
   d.text((24+720*col,top+48),variant.upper(),font=small,fill='#52645b')
   img=Image.open(BASE/'renders'/f'{asset}_{variant}.png').convert('RGB').resize((720,600),Image.Resampling.LANCZOS)
   canvas.paste(img,(720*col,top+65))
 canvas.save(BASE/'renders'/name)
sheet(assets[:1],'nala_before_after.png')
sheet(assets[1:3],'dogs_before_after.png')
sheet(assets[3:],'humans_before_after.png')
