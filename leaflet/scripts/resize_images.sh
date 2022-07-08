# full res -> reduced
for f in *.*; do echo "$f"; convert "$f" -resize 20% -quality 70 -strip -auto-orient resize/"$f"; done

# partial res -> reduced
for f in *.*; do echo "$f"; convert "$f" -resize 50% -quality 90 -strip -auto-orient resize/"$f"; done