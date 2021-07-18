#include "Pinpulse.h"
Pinpulse::Pinpulse(byte pinID, unsigned int pinNr, boolean polarity, elapsedMicros current_micros) {
  this->pinID = pinID;
  this->pinNr = pinNr;
  // set default value for polarity
  this->polarity = polarity;
  pinMode(pinID, OUTPUT);
  this->nextChangeTime = 99999999999999;
  this->run = true;
  this->current_micros = current_micros;
}

void Pinpulse::update() {
  if(run){
    if(current_micros >= this->nextChangeTime) {
      // Change pinState accordingly
      digitalWriteFast(this->pinNr,this->polarity);
      this->nextChangeTime = 99999999999999;
    }
    else{
      digitalWriteFast(this->pinNr,!(this->polarity));
    }
  }else{}
}

void Pinpulse::setTimer(unsigned long duration){
  this->nextChangeTime = this->current_micros + duration;
}

void Pinpulse::restart(){
  this->run = true;
  this->nextChangeTime = 99999999999999;
  digitalWriteFast(this->pinNr,this->polarity);
}

void Pinpulse::stop(){
	this->run = false;
}

byte Pinpulse::getId(){
  return this->pinID;
}