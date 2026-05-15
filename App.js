import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';

const App = () => {
  const [transcription, setTranscription] = useState("");
  const [isAECActive, setIsAECActive] = useState(true);
  const scrollViewRef = useRef();

  useEffect(() => {
    const interval = setInterval(() => {
      if (global.AudioCore) {
        const text = global.AudioCore.getTranscription();
        if (text && text !== transcription) {
          setTranscription(prev => prev + " " + text);
        }
      }
    }, 200);
    return () => clearInterval(interval);
  }, [transcription]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AudioSense <Text style={styles.pro}>Ai</Text></Text>
        <View style={[styles.aecBadge, { backgroundColor: isAECActive ? '#00FF66' : '#FF3333' }]}>
          <Text style={styles.aecText}>{isAECActive ? "HW AEC ACTIVE" : "AEC ERROR"}</Text>
        </View>
      </View>

      <View style={styles.transcriptionBox}>
        <Text style={styles.label}>LIVE TRANSCRIPTION</Text>
        <ScrollView 
          ref={scrollViewRef}
          onContentSizeChange={() => scrollViewRef.current.scrollToEnd({ animated: true })}
          style={styles.textScroll}
        >
          <Text style={styles.liveText}>{transcription || "Listening for speech..."}</Text>
        </ScrollView>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <Text style={styles.label}>VOLUME</Text>
          <Slider style={styles.slider} minimumValue={0} maximumValue={2} minimumTrackTintColor="#00FF66" />
        </View>
        
        <View style={styles.controlRow}>
          <Text style={styles.label}>NOISE SUPPRESSION</Text>
          <Slider style={styles.slider} minimumValue={0} maximumValue={1} minimumTrackTintColor="#00FF66" />
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.langBtn}>
          <Text style={styles.langText}>EN ▾</Text>
        </TouchableOpacity>
        <Text style={styles.latencyText}>Engine Latency: 14ms</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505', padding: 20, paddingTop: 50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  title: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  pro: { color: '#00FF66' },
  aecBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  aecText: { color: '#000', fontSize: 10, fontWeight: '900' },
  transcriptionBox: { flex: 1, backgroundColor: '#111', borderRadius: 20, padding: 20, marginBottom: 30, borderLeftWidth: 4, borderLeftColor: '#00FF66' },
  label: { color: '#666', fontSize: 10, letterSpacing: 1, marginBottom: 10 },
  textScroll: { flex: 1 },
  liveText: { color: '#FFF', fontSize: 18, lineHeight: 28 },
  controls: { marginBottom: 30 },
  controlRow: { marginBottom: 20 },
  slider: { width: '100%', height: 40 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  langBtn: { backgroundColor: '#222', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  langText: { color: '#FFF', fontWeight: 'bold' },
  latencyText: { color: '#444', fontSize: 12 }
});

export default App;
