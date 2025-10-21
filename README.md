Reveal

Installation:

open your terminal

first install node (development setup had node v22.13.0)

Then install angular (development setup had angular 14.1.0)

run npm install

Go to the front folder and run ng serve to start the front end

For the backend, open a new terminal and go to the back folder

create a new conda environment

run the requirements.txt file with

pip install -r requirements.txt

run the backend server with python app.py

Data setup:

Please take your dataset, go to: https://github.com/leovsferreira/reveal-preprocessing

Follow the steps there to preprocess your data

you can skip these steps -- I have already uploaded the images that you (Keira and Deepikka)

In order to run reveal, images must be served using services such as google cloud and aws

Once you you have the images publicly available and that can be accessible through links (ill implement this later)

Next, create the following repositories in the back folder

/dataset/files/

transfer tensor files generated in the reveal preprocessing pipeline into the folder and also data_final.json and unique_texts_final.json

then create the following repository

/dataset/llm/

copy the /processed/ and the /thumbnails/ folder with all images inside the /llm/ folder


